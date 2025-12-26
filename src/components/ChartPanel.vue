<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import Plotly from 'plotly.js-dist';
import { STORAGE_BASE_URL, HDX_BASE_URL } from '../config';

const props = defineProps<{
  country: string;
  countryName?: string;
  category: string;
  adminLevel: string;
  populationType: string;
  selectedRange?: number;
}>();

const emit = defineEmits<{
  (e: 'data-updated', data: any[]): void;
  (e: 'district-selected', id: string): void;
  (e: 'update:selectedRange', value: number): void;
}>();

const hdxUrl = computed(() => {
    if (!props.countryName) return '#';
    // Clean name: "Sao Tome and Principe" -> "sao-tome-and-principe"
    const slug = props.countryName.toLowerCase().trim().replace(/\s+/g, '-');
    return `${HDX_BASE_URL}/${slug}-accessibility-indicators`;
});

const loading = ref(false);
const error = ref<string | null>(null);
const resultData = ref<any[]>([]); 
const allData = ref<any[]>([]);    
const lineChartData = ref<any[]>([]); // Contains National ADM0 Data for all ranges
const rankingData = ref<any[]>([]); 
const columns = ref<string[]>([]);
const currentPage = ref(1);
// Tabs
const activeTab = ref<'table' | 'barchart' | 'linechart' | 'waffle' | 'ranking' | 'butterfly'>('waffle');

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let currentFileUrl = ''; 

const initDuckDB = async () => {
    try {
        const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
            mvp: { mainModule: duckdb_wasm, mainWorker: duckdb_worker },
            eh: { mainModule: duckdb_wasm, mainWorker: duckdb_worker },
        };
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
        const worker = new Worker(bundle.mainWorker!);
        // Use a silent logger to prevent console clutter
        const logger = { log: () => {} } as any; 
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        conn = await db.connect();
        await fetchData(); 
    } catch (e: any) {
        console.error("DuckDB Init Error", e);
        error.value = "Failed to initialize analytics engine: " + e.message;
    }
};

const getFileUrl = async () => {
    const countryLower = props.country.toLowerCase();
    const categoryLower = props.category.toLowerCase();
    const s3Prefix = `access/aux/stats/${countryLower}/category=${categoryLower}/`;
    const listUrl = `${STORAGE_BASE_URL}?list-type=2&prefix=${s3Prefix}`;
    const listResp = await fetch(listUrl);
    const listText = await listResp.text();
    const match = listText.match(/<Key>(.*?\.parquet)<\/Key>/);
    if (match && match[1]) {
        return `${STORAGE_BASE_URL}/${match[1]}`;
    }
    throw new Error(`No .parquet file found (checked prefix: ${s3Prefix})`);
};

const fetchData = async () => {
    if (!db || !conn) return;
    if (!props.country) return;

    loading.value = true;
    error.value = null;
    resultData.value = [];
    allData.value = [];
    currentPage.value = 1;

    try {
        currentFileUrl = await getFileUrl();
        
        // 1. Fetch Main Data (for Bar Chart)
        const popTypeMap: Record<string, string> = {
            'total': 'total', 'children': 'school_age', 
            'women_of_reproductive_age': 'women_childbearing', 'elderly': 'elderly',
            'adults': 'adults', 'youth': 'adults', 'under_5': 'under_5',
            'female': 'total', 'male': 'total'
        };
        const targetType = popTypeMap[props.populationType] || 'total';
        const whereClause = `admin_level = '${props.adminLevel}' AND population_type = '${targetType}'`;
        
        const query = `SELECT * FROM '${currentFileUrl}' WHERE ${whereClause} LIMIT 10000;`;
        const arrowResult = await conn.query(query);
        const data = arrowResult.toArray().map((row: any) => row.toJSON());

        if (data.length > 0) {
            columns.value = Object.keys(data[0]);
            allData.value = data;
        } else {
             const graphDiv = document.getElementById('access-chart');
             if (graphDiv) Plotly.purge(graphDiv as any);
        }
        
        processUpdates();

        // 2. Fetch National Data (Serve Linechart + Waffle)
        await fetchLineChartData();
        
        // 3. Conditional Fetch
        if (activeTab.value === 'ranking') await fetchRankingData();
        if (activeTab.value === 'table') await fetchTableData();

    } catch (e: any) {
        console.error('Data Fetch Error:', e);
        error.value = `Error loading data: ${e.message}`;
    } finally {
        loading.value = false;
    }
};

const fetchLineChartData = async () => {
    if (!conn || !currentFileUrl) return;
    try {
        const query = `
            SELECT range, population, population_type 
            FROM '${currentFileUrl}' 
            WHERE admin_level = 'ADM0'
            ORDER BY range ASC;
        `;
        const arrowResult = await conn.query(query);
        lineChartData.value = arrowResult.toArray().map((row: any) => row.toJSON());
        renderLineChart();
    } catch (e) {
        console.error("Line Chart Fetch Error:", e);
    }
}

// Retrigger Ranking when range changes
// Retrigger Ranking when range changes
watch(() => props.selectedRange, () => { 
    if (activeTab.value === 'ranking') fetchRankingData();
});

const tableData = ref<any[]>([]);
const sortKey = ref<string>('population');
const sortOrder = ref<'asc' | 'desc'>('desc');

const fetchTableData = async () => {
    if (!conn || !currentFileUrl) return;
    try {
        // Fetch ALL data for the current Admin Level (ignoring dropdown filters)
        // We select specific columns to optimize, but * can also work if schema is small
        const query = `
            SELECT * 
            FROM '${currentFileUrl}' 
            WHERE admin_level = '${props.adminLevel}'
            LIMIT 10000;
        `;
        const arrowResult = await conn.query(query);
        tableData.value = arrowResult.toArray().map((row: any) => row.toJSON());
    } catch (e) {
        console.error("Table Data Fetch Error:", e);
    }
};

const searchFilters = ref({
    name: '',
    range: '',
    population_type: ''
});

const sortedTableData = computed(() => {
    let data = [...tableData.value];

    // 1. Filter
    if (searchFilters.value.name) {
        const term = searchFilters.value.name.toLowerCase();
        data = data.filter(d => String(d.name || '').toLowerCase().includes(term));
    }
    if (searchFilters.value.range) {
        const term = searchFilters.value.range.toLowerCase();
        data = data.filter(d => {
            const val = props.category === 'education' ? (Number(d.range)/1000) + ' km' : (Number(d.range)/60) + ' min';
            return val.toLowerCase().includes(term);
        });
    }
    if (searchFilters.value.population_type) {
        const term = searchFilters.value.population_type.toLowerCase();
        data = data.filter(d => String(d.population_type || '').toLowerCase().replace(/_/g, ' ').includes(term));
    }

    // 2. Sort
    if (!sortKey.value) return data;

    return data.sort((a, b) => {
        let valA = a[sortKey.value];
        let valB = b[sortKey.value];

        // Numeric handling
        if (sortKey.value === 'range' || sortKey.value === 'population' || sortKey.value === 'population_share') {
            valA = Number(valA);
            valB = Number(valB);
        } else {
            // String case-insensitive
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1;
        return 0;
    });
});

const toggleSort = (key: string) => {
    // ... existing
    if (sortKey.value === key) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortOrder.value = 'desc'; 
    }
};

// ... existing fetchRankingData ...
const fetchRankingData = async () => {
     if (!conn || !currentFileUrl) return; 
    try {
        const rangeVal = Math.round(props.selectedRange || 0); 
        const popTypeMap: Record<string, string> = {
            'total': 'total', 'children': 'school_age', 
            'women_of_reproductive_age': 'women_childbearing', 'elderly': 'elderly',
            'adults': 'adults', 'youth': 'adults', 'under_5': 'under_5',
            'female': 'total', 'male': 'total'
        };
        const targetType = popTypeMap[props.populationType] || 'total';
        const query = `
            SELECT * FROM '${currentFileUrl}' 
            WHERE admin_level = 'ADM1' AND range = ${rangeVal} AND population_type = '${targetType}';
        `;
        const arrowResult = await conn.query(query);
        rankingData.value = arrowResult.toArray().map((row: any) => row.toJSON());
    } catch (e) { console.error("Ranking Data Fetch Error:", e); }
}

const renderChart = async (data: any[]) => {
    await nextTick();
    const graphDiv = document.getElementById('access-chart');
    if (!graphDiv) return;

    if (!data || data.length === 0) {
        Plotly.purge(graphDiv as any);
        return;
    }

    const viridis = [
        '#fde725', '#dce319', '#b8de29', '#95d840', '#75d054', 
        '#56c667', '#3dbc74', '#29af7f', '#20a387', '#1f968b',
        '#238a8d', '#287d8e', '#2d708e', '#33638d', '#39568c',
        '#404788', '#453781', '#482677', '#481567', '#440154'
    ];

    const sample = data[0];
    const yKey = 'population_interval_share' in sample ? 'population_interval_share' : 
                 ('population_share' in sample ? 'population_share' : 'value');

    const nameKey = Object.keys(sample).find(k => 
        k !== 'range' && k !== 'admin_level' && k !== 'population_type' && 
        k !== 'country' && k !== 'category' && k !== 'iso' && k !== 'id' &&
        typeof sample[k] === 'string'
    ) || 'name';

    const uniqueRanges = Array.from(new Set(data.map(d => Number(d.range)))).sort((a, b) => a - b);
    const totals: Record<string, number> = {};
    data.forEach(d => {
        const name = d[nameKey];
        const val = Number(d[yKey]) || 0;
        totals[name] = (totals[name] || 0) + val;
    });

    const uniqueNames = Array.from(new Set(data.map(d => d[nameKey]))).sort((a, b) => {
        return (totals[b] || 0) - (totals[a] || 0);
    });

    const formatRange = (val: number) => {
        if (props.category === 'education') return `${val / 1000} km`;
        else return `${val / 60} min`;
    };

    const traces = uniqueRanges.map((range, idx) => {
        const yValues = uniqueNames.map(name => {
            const row = data.find(d => Number(d.range) === range && d[nameKey] === name);
            return row ? Number(row[yKey]) : 0;
        });

        const colorIndex = uniqueRanges.length > 1 
            ? Math.floor((idx / (uniqueRanges.length - 1)) * (viridis.length - 1))
            : 0;
            
        return {
            x: uniqueNames,
            y: yValues,
            name: formatRange(range),
            type: 'bar',
            marker: { color: viridis[colorIndex] }
        };
    });

    const layout = {
        title: { text: `Population Access by Admin Area`, font: { color: '#fff' } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        barmode: 'stack', 
        xaxis: {
            title: { text: 'Admin Area', font: { color: '#aaa' } },
            tickfont: { color: '#aaa' },
            gridcolor: 'rgba(255,255,255,0.1)',
            fixedrange: true
        },
        yaxis: {
            title: { text: 'Population Share (%)', font: { color: '#aaa' } },
            tickfont: { color: '#aaa' },
            gridcolor: 'rgba(255,255,255,0.1)',
            fixedrange: true,
            range: [0, 100]
        },
        margin: { t: 40, r: 20, b: 80, l: 60 },
        showlegend: true,
        legend: { font: { color: '#aaa' }, orientation: 'h', y: -0.2 }
    };

    try {
        await Plotly.newPlot(graphDiv as any, traces as any, layout as any, { responsive: true, displayModeBar: false });
    } catch (e) {
        console.error("Plotly Render Error:", e);
    }
};

const renderLineChart = async () => {
    await nextTick();
    const graphDiv = document.getElementById('line-chart');
    if (!graphDiv || lineChartData.value.length === 0) return;

    const labelMap: Record<string, string> = {
        'total': 'Total',
        'under_5': 'Under 5',
        'school_age': 'School Age',
        'women_childbearing': 'Women',
        'adults': 'Adults',
        'elderly': 'Elderly'
    };

    const sortOrder = ['total', 'under_5', 'school_age', 'women_childbearing', 'adults', 'elderly'];
    const typeColors: Record<string, string> = {
        'total': '#ffffff', 'under_5': '#ffbe0b', 'school_age': '#fb5607',
        'women_childbearing': '#ff006e', 'adults': '#8338ec', 'elderly': '#3a86ff'
    };

    let types = Array.from(new Set(lineChartData.value.map(d => d.population_type)));
    types.sort((a, b) => {
        const idxA = sortOrder.indexOf(a);
        const idxB = sortOrder.indexOf(b);
        return (idxA > -1 ? idxA : 999) - (idxB > -1 ? idxB : 999);
    });
    
    const traces = types.map(type => {
        const typeData = lineChartData.value
            .filter(d => d.population_type === type)
            .sort((a, b) => Number(a.range) - Number(b.range));
            
        return {
            x: typeData.map(d => props.category === 'education' ? Number(d.range)/1000 : Number(d.range)/60),
            y: typeData.map(d => Number(d.population)), 
            name: labelMap[type] || type,
            mode: 'lines',
            type: 'scatter',
            line: { shape: 'spline', color: typeColors[type] || '#888' } 
        };
    });

    const xLabel = props.category === 'education' ? 'Range (km)' : 'Time (min)';
    const layout = {
        title: { text: `National Accessibility (ADM0) - Absolute`, font: { color: '#fff' } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(255,255,255,0.05)',
        xaxis: { title: { text: xLabel, font: { color: '#aaa' } }, tickfont: { color: '#aaa' }, gridcolor: 'rgba(255,255,255,0.1)' },
        yaxis: { title: { text: 'Population', font: { color: '#aaa' } }, tickfont: { color: '#aaa' }, gridcolor: 'rgba(255,255,255,0.1)' },
        margin: { t: 50, r: 30, b: 60, l: 60 },
        showlegend: true,
        legend: { font: { color: '#aaa' }, orientation: 'h', y: -0.2 }
    };
    try { await Plotly.newPlot(graphDiv as any, traces as any, layout as any, { responsive: true, displayModeBar: false }); } catch (e) { console.error(e); }
};

const processUpdates = () => {
    if (props.selectedRange && allData.value.length > 0) {
        const rangeVal = Math.round(props.selectedRange);
        resultData.value = allData.value.filter(d => Number(d.range) === rangeVal);
    } else {
        resultData.value = [];
    }
    emit('data-updated', resultData.value);

    // Tab Logic
    if (activeTab.value === 'barchart') setTimeout(() => renderChart(allData.value), 200);
    else if (activeTab.value === 'linechart') setTimeout(() => renderLineChart(), 200);
    else if (activeTab.value === 'ranking') fetchRankingData();
};

onMounted(() => { initDuckDB(); });

watch(() => [props.country, props.category, props.adminLevel, props.populationType], () => { fetchData(); });
watch(() => props.selectedRange, () => { processUpdates(); });

watch(activeTab, (newTab) => {
    if (newTab === 'barchart') setTimeout(() => renderChart(allData.value), 200);
    if (newTab === 'linechart') {
        if (lineChartData.value.length === 0) fetchLineChartData();
        else renderLineChart();
    }
    if (newTab === 'ranking') fetchRankingData();
    if (newTab === 'table' && tableData.value.length === 0) fetchTableData();
});

// Proportional Waffle & Butterfly Logic
const formatCompact = (n: number) => {
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(n);
};

// Local Range Selection for Charts (Proxy to Global)
const proxySelectedRange = computed({
    get: () => props.selectedRange || (props.category === 'education' ? 10000 : 1800),
    set: (val) => emit('update:selectedRange', val)
});

watch(proxySelectedRange, () => {
    if (activeTab.value === 'ranking') fetchRankingData();
});

const displayRanges = computed(() => {
    if (props.category === 'education') {
        return [
            { label: '5 km', value: 5000 },
            { label: '10 km', value: 10000 },
            { label: '20 km', value: 20000 },
            { label: '30 km', value: 30000 },
            { label: '50 km', value: 50000 },
        ];
    } else {
        return [
            { label: '10 min', value: 600 },
            { label: '30 min', value: 1800 },
            { label: '60 min', value: 3600 },
            { label: '90 min', value: 5400 },
            { label: '120 min', value: 7200 }
        ];
    }
});

const rawDemographics = computed(() => {
    const data = lineChartData.value;
    if (data.length === 0) return [];

    const targetRange = proxySelectedRange.value;

    let cohorts: string[] = [];
    if (props.category === 'education') {
        cohorts = ['school_age', 'other'];
    } else {
        cohorts = ['under_5', 'school_age', 'women_childbearing', 'elderly', 'other'];
    }

    const typeColors: Record<string, string> = {
        'under_5': 'bg-cyan-400 text-cyan-900', // User Requested
        'school_age': 'bg-indigo-500 text-white',
        'women_childbearing': 'bg-rose-500 text-white',
        'adults': 'bg-emerald-500 text-white',
        'elderly': 'bg-violet-500 text-white',
        'other': 'bg-slate-400 text-white', // Default Match
    };

    const labelMap: Record<string, string> = {
        'under_5': 'Children (<5)',
        'school_age': 'School Age',
        'women_childbearing': 'Women (15-49)',
        'elderly': 'Elderly (60+)',
        'other': 'Other Population'
    };

    const getUniverse = (type: string) => {
        const pops = data.filter(d => d.population_type === type).map(d => Number(d.population));
        return Math.max(...pops, 0); 
    };

    const getReached = (type: string) => {
        const row = data.find(d => d.population_type === type && Number(d.range) === targetRange);
        return row ? Number(row.population) : 0;
    };

    // Calculate Specifics
    const specifics = cohorts.filter(c => c !== 'other').map(type => ({
        type, 
        total: getUniverse(type), 
        reached: getReached(type)
    }));
    
    // Calculate "Other"
    const countryTotal = getUniverse('total');
    const countryReached = getReached('total');
    
    // "Other" is remainder of Total - Sum(Specifics) 
    // BUT user lists "other" explicitly in cohorts list anyway.
    // If 'other' is in cohorts, we calculate it.
    let results = specifics.map(s => ({
        type: s.type,
        label: labelMap[s.type],
        totalPop: s.total,
        reachedPop: s.reached,
        baseColor: typeColors[s.type]
    }));

    if (cohorts.includes('other')) {
        const sumSpecificTotal = specifics.reduce((sum, s) => sum + s.total, 0);
        const sumSpecificReached = specifics.reduce((sum, s) => sum + s.reached, 0);
        
        const otherTotal = Math.max(0, countryTotal - sumSpecificTotal);
        const otherReached = Math.max(0, countryReached - sumSpecificReached);
        
        if (otherTotal > 0) {
            results.push({
                type: 'other',
                label: labelMap['other'],
                totalPop: otherTotal,
                reachedPop: otherReached,
                baseColor: typeColors['other']
            });
        }
    }

    // Sort by Total Pop (Desc)
    return results.sort((a, b) => b.totalPop - a.totalPop);
});

const squareUnit = computed(() => {
    if (rawDemographics.value.length === 0) return 1000;
    const maxPop = Math.max(...rawDemographics.value.map(c => c.totalPop));
    if (maxPop === 0) return 1000;

    const rawUnit = maxPop / 50; 
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawUnit)));
    // e.g. if unit is 432 -> mag 100 -> ceil(4.32)*100 = 500
    return Math.ceil(rawUnit / magnitude) * magnitude;
});

const scaledCohorts = computed(() => {
    const unit = squareUnit.value;
    return rawDemographics.value.map(c => {
        const totalSquares = Math.round(c.totalPop / unit);
        const reachedSquares = Math.round(c.reachedPop / unit);
        const unreachedSquares = Math.max(0, totalSquares - reachedSquares);
        
        return { ...c, totalSquares, reachedSquares, unreachedSquares };
    });
});

// Butterfly Chart Logic
const butterflyData = computed(() => {
    const raw = rawDemographics.value;
    if (raw.length === 0) return [];

    const rows = raw.map(c => {
        const unreached = Math.max(0, c.totalPop - c.reachedPop);
        const total = c.totalPop; // or c.reachedPop + unreached
        return {
            label: c.label,
            reached: c.reachedPop,
            unreached: unreached,
            reachedPct: total > 0 ? Math.round((c.reachedPop / total) * 100) : 0,
            unreachedPct: total > 0 ? Math.round((unreached / total) * 100) : 0,
            baseColor: c.baseColor
        };
    });

    // Find the maximum single bar value to scale against
    const maxVal = Math.max(...rows.map(r => Math.max(r.reached, r.unreached)), 1);

    return rows.map(r => ({
        ...r,
        maxVal // Pass maxVal for width calculation
    }));
});

// Ranking Helper
const getSortedRanking = computed(() => {
    return [...rankingData.value].sort((a, b) => Number(a.population_share) - Number(b.population_share));
});

const selectDistrict = (id: string) => {
    emit('district-selected', id);
};

    </script>

    <template>
      <div class="chart-panel text-slate-900 dark:text-slate-100 p-4">
        
        <!-- Tabs Header -->
        <div class="tabs-header border-b border-slate-200 dark:border-slate-800">
            <button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'waffle' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'waffle'">Access Gap</button>
            <button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'barchart' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'barchart'">Barchart</button>
            <button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'ranking' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'ranking'">Ranking</button>
            <button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'table' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'table'">Table</button>
            <button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'butterfly' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'butterfly'">Demographics</button>
            <!--<button class="px-3 py-2 rounded text-sm transition-colors" :class="activeTab === 'linechart' ? 'text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" @click="activeTab = 'linechart'">Line Chart</button>-->
            
        
    </div>

    <!-- Loading -->
    <div v-if="loading && activeTab !== 'linechart' && activeTab !== 'waffle' && activeTab !== 'ranking' && activeTab !== 'butterfly'" class="loading-state">
      <div class="spinner"></div><p>Processing Data...</p>
    </div>
    <div v-else-if="error" class="error-state">{{ error }}<button @click="fetchData">Retry</button></div>
    
    <!-- TABLE -->
    <div v-else-if="activeTab === 'table'" class="content-state">
       <div class="header-row"><span class="badge">{{ sortedTableData.length }} results</span></div>
       <div class="table-container">
          <div v-if="sortedTableData.length === 0" class="no-data"><p>No data found.</p></div>
          <table v-else>
              <thead>
                  <tr>
                      <th class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none pb-2 align-top" @click="toggleSort('name')">
                          <div>Name <span v-if="sortKey === 'name'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></div>
                          <input 
                            type="text" 
                            v-model="searchFilters.name" 
                            @click.stop 
                            placeholder="Filter..." 
                            class="mt-1 w-full px-2 py-1 text-xs font-normal border rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-teal-500"
                          />
                      </th>
                      <th @click="toggleSort('range_type')" class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none align-top">
                          Dimension <span v-if="sortKey === 'range_type'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                      </th>
                      <th class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none pb-2 align-top" @click="toggleSort('range')">
                          <div>Range <span v-if="sortKey === 'range'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></div>
                          <input 
                            type="text" 
                            v-model="searchFilters.range" 
                            @click.stop 
                            placeholder="Filter..." 
                            class="mt-1 w-full px-2 py-1 text-xs font-normal border rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-teal-500"
                          />
                      </th>
                      <th class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none pb-2 align-top" @click="toggleSort('population_type')">
                          <div>Demographic <span v-if="sortKey === 'population_type'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></div>
                          <input 
                            type="text" 
                            v-model="searchFilters.population_type" 
                            @click.stop 
                            placeholder="Filter..." 
                            class="mt-1 w-full px-2 py-1 text-xs font-normal border rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-teal-500"
                          />
                      </th>
                      <th @click="toggleSort('population')" class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none align-top">
                          Population <span v-if="sortKey === 'population'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                      </th>
                      <th @click="toggleSort('population_share')" class="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none align-top">
                          Pop. % <span v-if="sortKey === 'population_share'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                      </th>
                  </tr>
              </thead>
              <tbody>
                  <!-- Limited to first 10 rows as requested -->
                  <tr v-for="(row, i) in sortedTableData.slice(0, 10)" :key="i">
                      <td class="font-medium text-slate-700 dark:text-slate-200">{{ row.name }}</td>
                      <td class="text-slate-500 dark:text-slate-400 capitalize">{{ row.range_type === 'time' ? 'Time' : (row.range_type === 'distance' ? 'Distance' : row.range_type) }}</td>
                      <td class="text-slate-600 dark:text-slate-300">
                          {{ category === 'education' ? (Number(row.range)/1000) + ' km' : (Number(row.range)/60) + ' min' }}
                      </td>
                      <td class="text-slate-600 dark:text-slate-300 capitalize">{{ row.population_type.replace(/_/g, ' ') }}</td>
                      <td class="font-bold text-slate-800 dark:text-slate-100">{{ Number(row.population).toLocaleString() }}</td>
                      <td class="text-slate-600 dark:text-slate-300">{{ Number(row.population_share).toFixed(1) }}%</td>
                  </tr>
              </tbody>
          </table>
       </div>
    </div>

    <!-- BARCHART -->
    <div v-else-if="activeTab === 'barchart'" class="content-state">
        <div id="access-chart" class="chart-container"></div>
    </div>

    <!-- LINE CHART -->
    <div v-else-if="activeTab === 'linechart'" class="content-state">
         <div v-if="lineChartData.length === 0 && loading" class="loading-state"><div class="spinner"></div><p>Loading...</p></div>
         <div v-else id="line-chart" class="chart-container"></div>
    </div>

    <!-- PROPORTIONAL WAFFLE -->
     <div v-else-if="activeTab === 'waffle'" class="content-state waffle-container">
        
        <div class="flex justify-between items-end mb-4">
            <div>
                <h3 class="waffle-title text-slate-800 dark:text-slate-100 !mb-0">Population Scale</h3>
                <div class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>Comparing total groups & access at</span>
                     <select 
                        v-model="proxySelectedRange" 
                        class="bg-transparent border-none text-teal-600 dark:text-teal-400 font-bold text-xs cursor-pointer hover:text-teal-500 dark:hover:text-teal-300 focus:ring-0 p-0"
                    >
                        <option v-for="r in displayRanges" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                </div>
            </div>
            <div class="text-right">
                <div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold">Scale</div>
                <div class="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                    <span class="w-3 h-3 bg-slate-300 dark:bg-slate-400 rounded-[1px]"></span>
                    = ~{{ formatCompact(squareUnit) }} people
                </div>
            </div>
        </div>

        <div v-if="lineChartData.length === 0 && loading" class="loading-state">
             <div class="spinner"></div><p>Loading Demographics...</p>
        </div>

        <div v-else class="space-y-6">
            <div v-for="cohort in scaledCohorts" :key="cohort.type" class="cohort-item">
                <div class="flex justify-between items-baseline mb-2">
                    <div class="flex items-center gap-2">
                        <!-- <span class="text-lg">{{ cohort.icon }}</span> -->
                        <span class="px-2 py-0.5 rounded text-xs font-bold shadow-sm" :class="cohort.baseColor">{{ cohort.label }}</span>
                        <span class="text-xs text-slate-400 dark:text-slate-500">({{ formatCompact(cohort.totalPop) }} total)</span>
                    </div>
                    <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {{ Math.round((cohort.reachedPop / cohort.totalPop) * 100) }}% Covered
                    </div>
                </div>

                <div class="flex flex-wrap gap-[2px]">
                    <div 
                        v-for="i in cohort.reachedSquares" 
                        :key="`r-${i}`"
                        class="w-2.5 h-2.5 rounded-[1px] transition-all hover:opacity-80"
                        :class="cohort.baseColor"
                        :title="`Reached: ~${formatCompact(cohort.reachedSquares * squareUnit)}`"
                    ></div>
                    
                    <div 
                        v-for="j in cohort.unreachedSquares" 
                        :key="`u-${j}`"
                        class="w-2.5 h-2.5 bg-slate-200 dark:bg-slate-800 rounded-[1px]"
                        title="Not Reached"
                    ></div>
                </div>

                <div v-if="cohort.unreachedSquares > 0" class="mt-1 text-[10px] text-red-400/70 font-medium text-right">
                    {{ formatCompact(cohort.totalPop - cohort.reachedPop) }} not reached
                </div>
            </div>
        </div>
    </div>

    <!-- BUTTERFLY CHART -->
    <div v-else-if="activeTab === 'butterfly'" class="content-state butterfly-container">
        <div class="flex justify-between items-start mb-4">
             <div>
                <h3 class="waffle-title text-slate-800 dark:text-slate-100 !mb-1">Access Gap (Absolute Numbers)</h3>
                <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>Reached vs. Not Reached at</span>
                    <select 
                        v-model="proxySelectedRange" 
                        class="bg-slate-100 dark:bg-slate-800 border-none text-teal-600 dark:text-teal-400 font-bold text-sm cursor-pointer hover:text-teal-500 dark:hover:text-teal-300 focus:ring-0 py-0 pl-0 pr-6 rounded"
                    >
                        <option v-for="r in displayRanges" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                </div>
             </div>
        </div>

        <div v-if="lineChartData.length === 0 && loading" class="loading-state">
             <div class="spinner"></div><p>Loading Data...</p>
        </div>

        <div v-else class="butterfly-viz mt-4">
            <!-- Legend -->
            <div class="flex justify-center gap-8 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-2">
                     <span class="w-3 h-3 bg-emerald-500 rounded-sm"></span> Reached
                </div>
                <div class="flex items-center gap-2">
                     <span class="w-3 h-3 bg-rose-500 rounded-sm"></span> Not Reached
                </div>
            </div>

            <div class="space-y-4">
                <div v-for="row in butterflyData" :key="row.label" class="grid grid-cols-[1fr_140px_1fr] gap-4 items-center group">
                    
                    <!-- LEFT: Reached -->
                    <div class="flex justify-end items-center gap-3">
                         <span class="text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{{ formatCompact(row.reached) }}</span>
                         <div 
                            class="h-6 rounded-l-sm bg-emerald-500/90 hover:bg-emerald-400 transition-all cursor-pointer relative flex items-center justify-end pr-2"
                            :style="{ width: (row.reached / row.maxVal) * 100 + '%' }"
                            :title="`Reached: ${row.reached.toLocaleString()} (${row.reachedPct}%)`"
                         >
                            <span v-if="row.reachedPct >= 10" class="text-[10px] font-bold text-emerald-950">{{ row.reachedPct }}%</span>
                         </div>
                    </div>

                    <!-- CENTER: Label -->
                    <div class="text-center truncate flex justify-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold shadow-sm trunctate max-w-full" :class="row.baseColor">{{ row.label }}</span>
                    </div>

                    <!-- RIGHT: Unreached -->
                    <div class="flex justify-start items-center gap-3">
                         <div 
                            class="h-6 rounded-r-sm bg-rose-500/90 hover:bg-rose-400 transition-all cursor-pointer relative flex items-center justify-start pl-2"
                            :style="{ width: (row.unreached / row.maxVal) * 100 + '%' }"
                            :title="`Not Reached: ${row.unreached.toLocaleString()} (${row.unreachedPct}%)`"
                         >
                            <span v-if="row.unreachedPct >= 10" class="text-[10px] font-bold text-rose-950">{{ row.unreachedPct }}%</span>
                         </div>
                         <span class="text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{{ formatCompact(row.unreached) }}</span>
                    </div>

                </div>
            </div>
        </div>
    </div>

    <!-- RANKING TAB -->
    <div v-else-if="activeTab === 'ranking'" class="content-state ranking-container">
        
        <div class="flex justify-between items-end mb-4">
            <div>
                <h3 class="waffle-title !mb-0 text-slate-800 dark:text-slate-100">Priority List (Admin 1)</h3>
                <div class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>Sorted by Least Access at</span>
                     <select 
                        v-model="proxySelectedRange" 
                        class="bg-transparent border-none text-teal-600 dark:text-teal-400 font-bold text-xs cursor-pointer hover:text-teal-500 dark:hover:text-teal-300 focus:ring-0 p-0"
                    >
                        <option v-for="r in displayRanges" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                </div>
            </div>
        </div>

        <div v-if="rankingData.length === 0 && loading" class="loading-state">
            <div class="spinner"></div><p>Loading District Ranking...</p>
        </div>

        <div v-else class="ranking-list text-sm">
             <div 
                v-for="(row, idx) in getSortedRanking" 
                :key="row.id || idx" 
                class="ranking-item group bg-white dark:bg-white/5 border border-slate-200 dark:border-transparent"
                @click="selectDistrict(row.id)"
             >
                <div class="flex justify-between items-center mb-1">
                    <div class="flex items-center gap-2">
                         <span class="text-xs text-slate-400 dark:text-slate-500 w-6">#{{ idx + 1 }}</span>
                         <span class="font-medium text-slate-700 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{{ row.name || row.ADM1_EN || row.id }}</span>
                    </div>
                    <span class="font-bold text-slate-800 dark:text-slate-100">{{ Number(row.population_share).toFixed(1) }}%</span>
                </div>
                
                <!-- Progress Bar -->
                <div class="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                        class="h-full rounded-full transition-all duration-500"
                        :style="{ width: `${Number(row.population_share)}%`, backgroundColor: Number(row.population_share) < 50 ? '#f87171' : (Number(row.population_share) < 80 ? '#facc15' : '#4ade80') }"
                    ></div>
                </div>
             </div>
        </div>
    </div>
    
      <!-- Data Source Footer -->
      <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-center text-slate-400">
          <span class="mr-1">Download this data here:</span>
          <a :href="hdxUrl" target="_blank" class="text-teal-600 dark:text-teal-400 hover:underline">HDX - {{ countryName }} Accessibility Indicators</a>
      </div>

  </div>
</template>

    <style scoped>
    .chart-panel { width: 100%; height: 100%; display: flex; flex-direction: column; }
    .tabs-header { display: flex; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 0.5rem; overflow-x: auto; flex-wrap: wrap; }
    
    /* Tabs are now styled via Tailwind in template, but keeping layout here */
    
    .chart-container { width: 100%; height: 100%; min-height: 500px; }
    
    .header-row { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
    .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
    
    .loading-state, .error-state { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .content-state { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    
    .spinner { width: 40px; height: 40px; border: 4px solid rgba(128,128,128,0.3); border-left-color: #14b8a6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .table-container { flex: 1; overflow: auto; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid rgba(128,128,128,0.2); }
    th { position: sticky; top: 0; }
    
    .no-data { padding: 2rem; text-align: center; }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 1rem 0 0 0; font-size: 0.9rem; }
    .pagination button { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
    .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
    
    /* Waffle/Strip Styles */
    .waffle-container, .butterfly-container { overflow-y: auto; }
    .waffle-title { font-size: 1.2rem; font-weight: bold; margin-bottom: 1.5rem; }
    
    /* Ranking Styles */
    .ranking-container { overflow-y: auto; }
    .ranking-list { display: flex; flex-direction: column; gap: 0.8rem; }
    .ranking-item { padding: 0.8rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
    .ranking-item:hover { transform: translateX(2px); }
    </style>
