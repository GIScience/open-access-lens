<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol, PMTiles } from 'pmtiles';
import heigitLogo from '../assets/HeiGIT_Logo_compact.svg';
import { TILES_BASE_URL, BASEMAP_STYLE, ADMIN_COLORS_10, ISOCHRONE_COLORS_EDUCATION, ISOCHRONE_COLORS_HEALTH } from '../config';
import { getBbox } from '../utils';
import type { StatsData, CountryOption } from '../types';

const props = defineProps<{
  country: string;
  category: string;
  adminLevel: string;
  selectedRange?: number;
  statsData?: StatsData[]; // Array of stats objects from DuckDB
  selectedDistrict?: string | null;
  isGlobalView?: boolean;
  showGlobalIsochrones?: boolean;
  availableCountries?: CountryOption[];
}>();

const emit = defineEmits(['select-country', 'map-move-end']);
// ...

// Helper to clear global iso layers
const clearGlobalIsoLayers = () => {
    if (!map) return;
    const style = map.getStyle();
    if (style && style.layers) {
        style.layers.forEach(l => {
            if (l.id.startsWith('global-iso-')) {
                map?.removeLayer(l.id);
            }
        });
    }
    Object.keys(map.getStyle().sources || {}).forEach(s => {
        if (s.startsWith('global-iso-')) {
            map?.removeSource(s);
        }
    });
};

// ...

  // --- GLOBAL VIEW LOGIC ---


const mapContainer = ref<HTMLElement | null>(null);
let map: maplibregl.Map | null = null;
let protocol: Protocol | null = null;
const isLegendExpanded = ref(true);

const localStats = ref<any[]>([]);
const currentAdminLayerName = ref<string>('');
const isZoomingToCountry = ref(false);

const opacity = ref(0.85); // Default updated to 0.85
const hiddenLegendLabels = ref<Set<string>>(new Set());
const toggleLegendItem = (label: string) => {
    if (hiddenLegendLabels.value.has(label)) {
        hiddenLegendLabels.value.delete(label);
    } else {
        hiddenLegendLabels.value.add(label);
    }
    // Trigger reactivity for Set by reassignment or deep watch, but for Set ref, mutation needs trigger.
    hiddenLegendLabels.value = new Set(hiddenLegendLabels.value);
};

watch(hiddenLegendLabels, () => {
    updateLayerColors();
}, { deep: true });

const updateLayerColors = () => {
    if (!map) return;

    // 1. Isochrones (ADM0 & Global)
    // Common step logic
    let steps: any[] = [];
    const isHidden = (lbl: string) => hiddenLegendLabels.value.has(lbl);

    if (props.category === 'education') {
            steps = ['step', ['to-number', ['get', 'range']]];
            steps.push(isHidden('5 km') ? 'rgba(0,0,0,0)' : '#fde725');
            steps.push(5001); steps.push(isHidden('10 km') ? 'rgba(0,0,0,0)' : '#b5de2b');
            steps.push(10001); steps.push(isHidden('15 km') ? 'rgba(0,0,0,0)' : '#6ece58');
            steps.push(15001); steps.push(isHidden('20 km') ? 'rgba(0,0,0,0)' : '#35b779');
            steps.push(20001); steps.push(isHidden('25 km') ? 'rgba(0,0,0,0)' : '#1f9e89');
            steps.push(25001); steps.push(isHidden('30 km') ? 'rgba(0,0,0,0)' : '#26828e');
            steps.push(30001); steps.push(isHidden('35 km') ? 'rgba(0,0,0,0)' : '#31688e');
            steps.push(35001); steps.push(isHidden('40 km') ? 'rgba(0,0,0,0)' : '#3e4989');
            steps.push(40001); steps.push(isHidden('45 km') ? 'rgba(0,0,0,0)' : '#482878');
            steps.push(45001); steps.push(isHidden('50 km') ? 'rgba(0,0,0,0)' : '#440154');
    } else {
            steps = ['step', ['to-number', ['get', 'range']]];
            steps.push(isHidden('10 min') ? 'rgba(0,0,0,0)' : '#fde725');
            steps.push(601); steps.push(isHidden('20 min') ? 'rgba(0,0,0,0)' : '#c2df23');
            steps.push(1201); steps.push(isHidden('30 min') ? 'rgba(0,0,0,0)' : '#86d549');
            steps.push(1801); steps.push(isHidden('40 min') ? 'rgba(0,0,0,0)' : '#52c569');
            steps.push(2401); steps.push(isHidden('50 min') ? 'rgba(0,0,0,0)' : '#2ab07f');
            steps.push(3001); steps.push(isHidden('60 min') ? 'rgba(0,0,0,0)' : '#1e9b8a');
            steps.push(3601); steps.push(isHidden('70 min') ? 'rgba(0,0,0,0)' : '#25858e');
            steps.push(4201); steps.push(isHidden('80 min') ? 'rgba(0,0,0,0)' : '#2d708e');
            steps.push(4801); steps.push(isHidden('90 min') ? 'rgba(0,0,0,0)' : '#38588c');
            steps.push(5401); steps.push(isHidden('100 min') ? 'rgba(0,0,0,0)' : '#433e85');
            steps.push(6001); steps.push(isHidden('110 min') ? 'rgba(0,0,0,0)' : '#482173');
            steps.push(6601); steps.push(isHidden('120 min') ? 'rgba(0,0,0,0)' : '#440154');
    }

    if (props.adminLevel === 'ADM0') {
        if (map.getLayer('isochrones-layer')) {
             map.setPaintProperty('isochrones-layer', 'fill-color', steps as any);
        }
        
        // Also update ALL Global Isochrone Layers if present
        if (props.isGlobalView) {
             const style = map.getStyle();
             if (style && style.layers) {
                 style.layers.forEach(l => {
                     if (l.id.startsWith('global-iso-layer-')) {
                         map!.setPaintProperty(l.id, 'fill-color', steps as any);
                     }
                 });
             }
        }
    }

    // 2. Admin Boundaries
    if (props.adminLevel !== 'ADM0' && map.getLayer('admin-boundaries-fill-layer')) {
         const isHidden = (lbl: string) => hiddenLegendLabels.value.has(lbl);
         let steps: any[] = ['step', ['feature-state', 'population_share']];
         steps.push(isHidden('0 - 10%') ? 'rgba(0,0,0,0)' : '#020b2e');
         steps.push(10); steps.push(isHidden('10 - 20%') ? 'rgba(0,0,0,0)' : '#081d58');
         steps.push(20); steps.push(isHidden('20 - 30%') ? 'rgba(0,0,0,0)' : '#253494');
         steps.push(30); steps.push(isHidden('30 - 40%') ? 'rgba(0,0,0,0)' : '#225ea8');
         steps.push(40); steps.push(isHidden('40 - 50%') ? 'rgba(0,0,0,0)' : '#1d91c0');
         steps.push(50); steps.push(isHidden('50 - 60%') ? 'rgba(0,0,0,0)' : '#41b6c4');
         steps.push(60); steps.push(isHidden('60 - 70%') ? 'rgba(0,0,0,0)' : '#7fcdbb');
         steps.push(70); steps.push(isHidden('70 - 80%') ? 'rgba(0,0,0,0)' : '#c7e9b4');
         steps.push(80); steps.push(isHidden('80 - 90%') ? 'rgba(0,0,0,0)' : '#edf8b1');
         steps.push(90); steps.push(isHidden('90 - 100%') ? 'rgba(0,0,0,0)' : '#ffffd9');
         
         map.setPaintProperty('admin-boundaries-fill-layer', 'fill-color', steps as any);
    }
};

watch(() => props.adminLevel, () => {
    hiddenLegendLabels.value.clear();
});

watch(opacity, (val) => {
    if (!map) return;
    if (map.getLayer('isochrones-layer')) {
        map.setPaintProperty('isochrones-layer', 'fill-opacity', Number(val));
    }
    if (map.getLayer('admin-boundaries-fill-layer')) {
        if (props.adminLevel === 'ADM0') {
        } else {
            map.setPaintProperty('admin-boundaries-fill-layer', 'fill-opacity', Number(val));
        }
    }
});


// Config imported from ../config

onMounted(() => {
  if (!mapContainer.value) return;

  // Register PMTiles protocol
  protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  
  // Always load the base map, even in Global View
  const initialStyle = BASEMAP_STYLE;

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: initialStyle,
    center: props.isGlobalView ? [0, 0] : [0, 0], // Center is overridden by fitBounds below if global
    zoom: props.isGlobalView ? 1 : 2, // Low zoom initially
    cooperativeGestures: false,
    touchZoomRotate: true,
    scrollZoom: true,
  });
  
  // If starting in Global View, fit to world bounds immediately
  if (props.isGlobalView) {
      map.fitBounds([[-170, -50], [170, 80]], { animate: false, padding: 20 });
  }

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  
  // DEBUG: Expose map to window for layer order inspection
  (window as any).debugMap = map;

  // Mac-style Trackpad Panning: Map Wheel (2-finger scroll) to Pan
      map.on('load', () => {
      // Basic load event
      const canvas = map!.getCanvas();
      canvas.addEventListener('wheel', (e) => {
          if (e.ctrlKey) return; 
          e.preventDefault();
          map!.panBy([e.deltaX, e.deltaY], { duration: 0 });
      }, { passive: false });
      
      // Ensure data is loaded initially
      updateMapData();

      // Resize Observer for smooth container transitions
      const resizeObserver = new ResizeObserver(() => {
          map?.resize();
      });
      if (mapContainer.value) {
          resizeObserver.observe(mapContainer.value);
      }
  });

// Watch Global View changes (for transitions)
watch(() => props.isGlobalView, (isGlobal) => {
    if (!map) return;
    
    // Switch Style (Same logic as Dark Mode)
    // Switch Style (Same logic as Dark Mode)
    const style = BASEMAP_STYLE;
    
    map.setStyle(style);

    const onStyleData = () => {
        if (map?.isStyleLoaded()) {
           updateMapData();
           map.off('styledata', onStyleData);
        }
    };
    map.on('styledata', onStyleData);

    // Zoom Reset if going local -> global
    if (isGlobal) {
        // 1. The sidebar starts closing NOW via CSS (duration-700)
        
        // 2. We wait slightly longer than the CSS transition (e.g., 750ms)
        setTimeout(() => {
            if (!map) return;

            // 3. Tell map to claim the full space
            map.resize();

            // 4. NOW zoom to the world. 
            // Since the map is full-width, this will center perfectly.
            map.fitBounds([[-170, -50], [170, 80]], {
                padding: 0, // No padding needed for global view
                animate: true,
                duration: 2000
            });
            
        }, 750); // Match this to your CSS 'duration-700' + buffer
    }
});



  // Click on admin boundary to show Popup with joined stats
  map.on('click', 'admin-boundaries-fill-layer', (e) => {
      // ... (Existing click logic)
      if (e.features && e.features.length > 0) {
          const feature = e.features[0]!;
          const properties = feature.properties;
          const id = properties.id;
          
          // Use localStats to avoid stale props
          const stats = localStats.value;
          
          // Debug matching
          const match = stats.find((s: any) => {
              // Strict string comparison
              return String(s.id).trim() === String(id).trim();
          });
          
          const stat = match;
          
          const textColor = '#111';

          let html = `<div style="color: ${textColor}; font-family: sans-serif; min-width: 150px;">`;
          html += `<strong>${properties.name} (${properties.admin_level})</strong><br/>`;
          html += `<small style="color: #666;">ID: ${id}</small><br/>`;
          
          if (stat) {
              html += `<hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;"/>`;
              html += `Range: ${stat.range} ${props.category === 'education' ? 'm' : 's'}<br/>`;
              html += `Population: <strong>${stat.population.toLocaleString()}</strong><br/>`;
              html += `Share: <strong>${Number(stat.population_share).toFixed(1)}%</strong>`;
          } else {
              html += `<br/><em>No statistics found.</em>`;
          }
          html += `</div>`;

          new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map!);
      }
  });

  // --- GLOBAL VIEW INTERACTION ---
  
  // Click Handler for Global Navigation
  map.on('click', 'global-boundaries-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0]!;
      const props = feature.properties;
      const iso = props?.iso_a3 || props?.ISO_A3 || props?.adm0_a3;
      
      if (iso && iso !== '-99') {
          console.log('Selected Global Country:', iso);
          emit('select-country', iso);
      }
  });

  // Pointer Cursor & Tooltip Popup for Global View
  const globalPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'global-country-tooltip'
  });

  map.on('mousemove', 'global-boundaries-fill', (e) => {
      if (!map) return;
      map.getCanvas().style.cursor = 'pointer';

      if (e.features && e.features.length > 0) {
          const feature = e.features[0]!;
          const props = feature.properties;
          
          const name = props?.NAME || props?.name || props?.ADMIN || 'Unknown';
          const iso = props?.ISO_A3 || props?.iso_a3 || props?.ADM0_A3 || props?.adm0_a3 || props?.sov_a3 || 'N/A';
          
          globalPopup.setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 2px 4px;">
                  <div style="font-size: 12px; font-weight: bold; color: #333;">${name}</div>
                  <div style="font-size: 10px; color: #666;">${iso}</div>
                </div>
              `)
              .addTo(map!);
      }
  });





  map.on('moveend', () => {
      if (isZoomingToCountry.value) {
          isZoomingToCountry.value = false;
          emit('map-move-end');
      }
  });

  map.on('click', 'global-boundaries-fill', (e) => {
      if (e.features && e.features.length > 0) {
          const feature = e.features[0]!;
          const props = feature.properties;
          const iso = props?.ISO_A3 || props?.iso_a3 || props?.ADM0_A3 || props?.adm0_a3 || props?.sov_a3;
          
          if (iso && iso !== 'N/A') {
              // Zoom to feature
              const bounds = getBbox(feature);
              
              if (bounds && map) {
                  isZoomingToCountry.value = true; // Set flag
                  map.fitBounds(bounds as [number, number, number, number], {
                      padding: { top: 50, bottom: 50, left: 50, right: 50 },
                      duration: 2000, 
                      essential: true,
                      animate: true
                  });
              }

              // Emit selection to trigger data load (but NOT UI transition yet)
              emit('select-country', iso);
          }
      }
  });
});



const setupIsochronesLayer = (layerId: string) => {
  // ... (Existing setupIsochronesLayer logic - no changes needed for theme unless outline color needs tweaking)
  if (!map) return;
  
  // Dynamic Coloring based on Category
  // Dynamic Coloring based on Category
  let steps: any[] = [];
  if (props.category === 'education') {
       steps = [
          'step',
          ['to-number', ['get', 'range']],
          ISOCHRONE_COLORS_EDUCATION[0],       // 0 - 5000 -> Yellow
          //1, '#fde725',
          5001, ISOCHRONE_COLORS_EDUCATION[1], // 5001 - 10000
          10001, ISOCHRONE_COLORS_EDUCATION[2],
          15001, ISOCHRONE_COLORS_EDUCATION[3],
          20001, ISOCHRONE_COLORS_EDUCATION[4], 
          25001, ISOCHRONE_COLORS_EDUCATION[5],
          30001, ISOCHRONE_COLORS_EDUCATION[6],
          35001, ISOCHRONE_COLORS_EDUCATION[7],
          40001, ISOCHRONE_COLORS_EDUCATION[8],
          45001, ISOCHRONE_COLORS_EDUCATION[9]
      ];
  } else {
       steps = [
          'step',
          ['to-number', ['get', 'range']],
          ISOCHRONE_COLORS_HEALTH[0], 
          601, ISOCHRONE_COLORS_HEALTH[1], 
          1201, ISOCHRONE_COLORS_HEALTH[2], 
          1801, ISOCHRONE_COLORS_HEALTH[3], 
          2401, ISOCHRONE_COLORS_HEALTH[4], 
          3001, ISOCHRONE_COLORS_HEALTH[5], 
          3601, ISOCHRONE_COLORS_HEALTH[6], 
          4201, ISOCHRONE_COLORS_HEALTH[7], 
          4801, ISOCHRONE_COLORS_HEALTH[8], 
          5401, ISOCHRONE_COLORS_HEALTH[9], 
          6001, ISOCHRONE_COLORS_HEALTH[10], 
          6601, ISOCHRONE_COLORS_HEALTH[11] 
      ];
  }

  // Add Isochrones Layer - ONLY IF Admin Level is ADM0 (Country)
  if (props.adminLevel === 'ADM0') {
    if (!map.getLayer('isochrones-layer')) {
      map.addLayer({
        id: 'isochrones-layer',
        type: 'fill',
        source: 'isochrones-source',
        'source-layer': layerId, 
        layout: {
            'fill-sort-key': ['-', ['to-number', ['get', 'range']]] 
        },
        paint: {
          'fill-color': steps as any,
          'fill-opacity': opacity.value,
          'fill-outline-color': 'rgba(0,0,0,0)'
        }       
      });
    }
  }
};

const setupAdminLayers = (layerName: string) => {
    if (!map) return;
      
    // Removed country filter as tiles are country specific and property might be missing
    const adminFilter = ['all', 
        ['==', ['get', 'admin_level'], props.adminLevel]
    ];

    // Prepare Color Match Expression from Stats Data
    let fillColor: any = '#333333'; // Default Dark Grey if no stats
    
    // Refined 10-class YlGnBu-like (Reversed: Low=Dark, High=Light)
    // ADMIN_COLORS_10 imported from config

    if (props.statsData && props.statsData.length > 0) {
        const matchExpression: any[] = ['match', ['to-string', ['get', 'id']]];

        props.statsData.forEach((stat: any) => {
            const val = Number(stat.population_share); 
            let color = ADMIN_COLORS_10[0];
            
            if (val >= 90) color = ADMIN_COLORS_10[9];
            else if (val >= 80) color = ADMIN_COLORS_10[8];
            else if (val >= 70) color = ADMIN_COLORS_10[7];
            else if (val >= 60) color = ADMIN_COLORS_10[6];
            else if (val >= 50) color = ADMIN_COLORS_10[5];
            else if (val >= 40) color = ADMIN_COLORS_10[4];
            else if (val >= 30) color = ADMIN_COLORS_10[3];
            else if (val >= 20) color = ADMIN_COLORS_10[2];
            else if (val >= 10) color = ADMIN_COLORS_10[1];
            else color = ADMIN_COLORS_10[0]; 
            
            matchExpression.push(String(stat.id), color);
        });
        
        matchExpression.push('#333333'); 
        fillColor = matchExpression;
    }
    
    // Fill Layer
    let beforeId: string | undefined = undefined;
    if (props.adminLevel === 'ADM0' && map.getLayer('isochrones-layer')) {
        beforeId = 'isochrones-layer';
    }
    if (!map.getLayer('admin-boundaries-fill-layer')) {
    map.addLayer({
        id: 'admin-boundaries-fill-layer',
        type: 'fill',
        source: 'admin-boundaries-source',
        'source-layer': layerName, 
        filter: adminFilter as any,
        paint: {
            'fill-color': props.adminLevel === 'ADM0'
                 ? '#333333' 
                 : fillColor,
            'fill-opacity': props.adminLevel === 'ADM0' ? 0.1 : 0.7, 
            'fill-outline-color': 'rgba(0,0,0,0)' 
        }
    }, beforeId);
    }
    
    // Line Layer
    const lineOpacity = props.adminLevel === 'ADM0' ? 0 : 0.5;
    const lineColor = '#666666'; // Grey on light
    if (!map.getLayer('admin-boundaries-line-layer')) {
    map.addLayer({
        id: 'admin-boundaries-line-layer',
        type: 'line',
        source: 'admin-boundaries-source',
        'source-layer': layerName,
        filter: adminFilter as any,
        paint: {
            'line-color': lineColor,
            'line-width': 1,
            'line-opacity': lineOpacity
        }
    });
    }
    
    // Highlight Layer (Selected District)
    if (!map.getLayer('admin-boundaries-highlight-layer')) {
    map.addLayer({
        id: 'admin-boundaries-highlight-layer',
        type: 'line',
        source: 'admin-boundaries-source',
        'source-layer': layerName,
        filter: ['==', ['get', 'id'], props.selectedDistrict || ''],
        layout: {
             'line-join': 'round',
             'line-cap': 'round'
        },
        paint: {
            'line-color': '#00ffff', // Cyan / Teal Bright
            'line-width': 3,
            'line-opacity': 1
        }
    });
    }
};

const updateHighlightFilter = () => {
    if (!map || !map.getLayer('admin-boundaries-highlight-layer')) return;
    
    if (props.selectedDistrict) {
        map.setFilter('admin-boundaries-highlight-layer', ['==', ['get', 'id'], props.selectedDistrict]);
        map.setPaintProperty('admin-boundaries-highlight-layer', 'line-opacity', 1);
    } else {
         map.setPaintProperty('admin-boundaries-highlight-layer', 'line-opacity', 0);
    }
};

watch(() => props.selectedDistrict, () => {
    updateHighlightFilter();
});



const updateMapData = () => {
  if (!map) return;

  // 1. Cleanup existing layers
  if (map.getLayer('isochrones-layer')) map.removeLayer('isochrones-layer');
  if (map.getLayer('isochrones-line-layer')) map.removeLayer('isochrones-line-layer');
  if (map.getSource('isochrones-source')) map.removeSource('isochrones-source');
  
  if (map.getLayer('admin-boundaries-fill-layer')) map.removeLayer('admin-boundaries-fill-layer');
  if (map.getLayer('admin-boundaries-line-layer')) map.removeLayer('admin-boundaries-line-layer');
  if (map.getLayer('admin-boundaries-highlight-layer')) map.removeLayer('admin-boundaries-highlight-layer'); 
  if (map.getSource('admin-boundaries-source')) map.removeSource('admin-boundaries-source');

  if (map.getLayer('global-boundaries-fill')) map.removeLayer('global-boundaries-fill');
  if (map.getLayer('global-boundaries-line')) map.removeLayer('global-boundaries-line');
  if (map.getSource('global-boundaries-source')) map.removeSource('global-boundaries-source');
  // Determine insertion point: Below first symbol layer (labels) to keep them legible

  // --- HELPER: Find Insertion Point ---
  // We want to slip our layers UNDER the first text label (symbol) layer
  // so city names stay visible on top.
  const findLabelLayerId = () => {
      const layers = map?.getStyle().layers || [];
      const labelLayer = layers.find(l => l.type === 'symbol');
      return labelLayer ? labelLayer.id : undefined;
  };
  const beforeId = findLabelLayerId();

  // --- GLOBAL VIEW LOGIC ---
  if (props.isGlobalView) {

      // Use the reliable Cloudfront URL (or your GitHub raw one)
      const globalGeoJsonUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/refs/heads/master/geojson/ne_110m_admin_0_countries.geojson';
      
      if (!map.getSource('global-boundaries-source')) {
          map.addSource('global-boundaries-source', {
              type: 'geojson',
              data: globalGeoJsonUrl,
              attribution: 'Natural Earth'
          });
      }
    // Fill Layer (Passing beforeId!)
      if (!map.getLayer('global-boundaries-fill')) {
          map.addLayer({
              id: 'global-boundaries-fill',
              type: 'fill',
              source: 'global-boundaries-source',
              paint: {
                  'fill-color': '#333333',
                  'fill-opacity': 0., // Invisible but interactive
                  'fill-outline-color': 'rgba(0,0,0,0)' // Transparent outline
              }
          }, beforeId); // <--- INSERT UNDER LABELS
      }

      // Line Layer (Passing beforeId!)
      if (!map.getLayer('global-boundaries-line')) {
          map.addLayer({
              id: 'global-boundaries-line',
              type: 'line',
              source: 'global-boundaries-source',
              paint: {
                  'line-color': '#00FFFF', 
                  'line-width': 1, 
                  'line-opacity': 1 // Invisible
              }
          }, beforeId); // <--- INSERT UNDER LABELS
      }
      
      // Handle Global Isochrones
      if (props.showGlobalIsochrones && props.availableCountries) {
          console.log(`[MapCanvas] Loading Global Isochrones for ${props.availableCountries.length} countries...`);
          
          if (map.getLayer('global-boundaries-line')) {
              map.setPaintProperty('global-boundaries-fill', 'fill-opacity', 0.); 
          }

          // Clear existing to avoid ID collision and ensure category update
          clearGlobalIsoLayers();

          // Detect layer name pattern from the first available country
          const detectLayerName = async () => {
              if (!props.availableCountries || props.availableCountries.length === 0) return 'isochrones';
              try {
                  const sample = props.availableCountries[0]!;
                  const isoLower = sample.value.toLowerCase();
                  const url = `${TILES_BASE_URL}/${isoLower}/${isoLower}_${props.category.toLowerCase()}_isochrones.pmtiles`;
                  const p = new PMTiles(url);
                  const meta = await p.getMetadata() as { vector_layers?: { id: string }[] };
                  if (meta && meta.vector_layers && meta.vector_layers.length > 0) {
                      console.log('[MapCanvas] Detected Global Layer Name:', meta.vector_layers[0]!.id);
                      return meta.vector_layers[0]!.id;
                  }
              } catch (e) {
                  console.warn('[MapCanvas] Failed to detect layer name, defaulting to "isochrones"', e);
              }
              return 'isochrones';
          };
        
          detectLayerName().then((detectedLayerName) => {
               props.availableCountries!.forEach(async (c) => {
                    const isoLower = c.value.toLowerCase();
                    const sourceId = `global-iso-source-${isoLower}`;
                    const layerId = `global-iso-layer-${isoLower}`;
                    
                    if (map?.getSource(sourceId)) return;

                    const url = `${TILES_BASE_URL}/${isoLower}/${isoLower}_${props.category.toLowerCase()}_isochrones.pmtiles`;

                    try {
                        map?.addSource(sourceId, {
                            type: 'vector',
                            url: `pmtiles://${url}`,
                            attribution: ''
                        });

                        // Standard Isochrone Color Steps
                        let steps: any[] = [];
                        if (props.category === 'education') {
                            steps = ['step', ['to-number', ['get', 'range']],
                                '#fde725', 5001, '#b5de2b', 10001, '#6ece58', 15001, '#35b779', 20001, '#1f9e89', 25001, '#26828e', 30001, '#31688e', 35001, '#3e4989', 40001, '#482878', 45001, '#440154'
                            ];
                        } else {
                            steps = ['step', ['to-number', ['get', 'range']],
                                '#fde725', 601, '#c2df23', 1201, '#86d549', 1801, '#52c569', 2401, '#2ab07f', 3001, '#1e9b8a', 3601, '#25858e', 4201, '#2d708e', 4801, '#38588c', 5401, '#433e85', 6001, '#482173', 6601, '#440154'
                            ];
                        }

                        // Use the detected layer name (assuming consistency across files)
                        // Fallback to stem if needed, but detection is safer.
                        let layerName = detectedLayerName;
                        
                        // Safety check: if detection returned generic 'isochrones', but this specific file uses stem?
                        // We rely on consistency.
                        
                        map?.addLayer({
                            id: layerId,
                            type: 'fill',
                            source: sourceId,
                            'source-layer': layerName,
                            paint: {
                                'fill-color': steps as any,
                                'fill-opacity': 0.7
                            }
                        }, 'global-boundaries-line'); 

                    } catch (e) {
                        // ignore 
                    }
                });
          });

      } else {
          clearGlobalIsoLayers();
          if (map.getLayer('global-boundaries-fill')) {
              map.setPaintProperty('global-boundaries-fill', 'fill-opacity', 0); 
          }
      }

      return;
  }

  // --- DASHBOARD VIEW LOGIC (Existing) ---
  const isoLower = props.country.toLowerCase();
  const isochronesUrl = `${TILES_BASE_URL}/${isoLower}/${isoLower}_${props.category.toLowerCase()}_isochrones.pmtiles`;
  const boundariesUrl = `${TILES_BASE_URL}/${isoLower}/${isoLower}_boundaries.pmtiles`;
  
  const loadSource = async () => {
    if (!map) return;

    // Safety: If dashboard mode but NO country yet (delayed), wait.
    if (!props.country) return;

    try {
        // 1. Isochrones (Base)
        const pIso = new PMTiles(isochronesUrl);
        // ... (rest of loadSource logic)
        const headerIso = await pIso.getHeader();
        if (headerIso) {
            map.fitBounds(
                [[headerIso.minLon, headerIso.minLat], [headerIso.maxLon, headerIso.maxLat]],
                { padding: 20, animate: true }
            );
        }

        if (!map.getSource('isochrones-source')) {
           map.addSource('isochrones-source', {
               type: 'vector',
               url: `pmtiles://${isochronesUrl}`,
               attribution: '© OpenStreetMap, © Heigit'
           });
        }
        
        const metaIso = await pIso.getMetadata() as { vector_layers?: { id: string }[] };
        let isoLayerName = 'isochrones';
        if (metaIso && metaIso.vector_layers && metaIso.vector_layers.length > 0) {
            isoLayerName = metaIso.vector_layers[0]!.id;
        } else {
            const stem = `${isoLower}_${props.category.toLowerCase()}_isochrones`;
            isoLayerName = stem;
        }
        setupIsochronesLayer(isoLayerName);
        
        // 2. Admin Boundaries
        if (props.adminLevel) {
             try {
                 const pBound = new PMTiles(boundariesUrl);
                 const metaBound = await pBound.getMetadata() as { vector_layers?: { id: string }[] };
                 let layerName = 'boundaries'; 
                 const targetLayerId = props.adminLevel.toLowerCase();
                 const availableLayers = metaBound?.vector_layers?.map(l => l.id) || [];
                 
                 if (availableLayers.includes(targetLayerId)) {
                     layerName = targetLayerId;
                 } else if (availableLayers.length > 0) {
                     layerName = availableLayers[0]!;
                 }
                 currentAdminLayerName.value = layerName;
 
                 if (!map.getSource('admin-boundaries-source')) {
                     map.addSource('admin-boundaries-source', {
                        type: 'vector',
                        url: `pmtiles://${boundariesUrl}`,
                        attribution: '© OpenStreetMap',
                        promoteId: 'id'
                     });
                 }
                 
                 setupAdminLayers(layerName);
                 syncMapData();
             } catch (e) {
                 console.error('[MapCanvas] Failed to load boundaries metadata:', e);
             }
        }
    } catch (e) {
        console.error('[MapCanvas] Error loading tiles:', e);
    }
  };
  
  loadSource();
};

// Local ref to avoid stale closures in MapLibre callbacks

const syncMapData = () => {
    if (!map || !localStats.value.length || !currentAdminLayerName.value) return;
    
    // Inject stats into map features via feature-state
    localStats.value.forEach((stat: any) => {
        if (!stat.id) return;
        map!.setFeatureState(
            { source: 'admin-boundaries-source', sourceLayer: currentAdminLayerName.value, id: stat.id },
            { population_share: Number(stat.population_share) }
        );
    });
    
    // Refresh colors if needed (force repaint)
    // MapLibre updates feature-state bindings automatically, but we might need to verify if style uses it.
};

watch(() => [props.country, props.category, props.adminLevel, props.statsData, props.showGlobalIsochrones, props.isGlobalView, props.availableCountries], ([, , , stats]) => {
  // Update local ref
  localStats.value = (stats || []) as any[];
  
  updateMapData();
}, { deep: true });

// Specific watcher to zoom when country changes
// Removed hardcoded CENTERS watcher. Zoom is now handled in updateMapData via PMTiles metadata.

import { onUpdated, computed } from 'vue';

// Legend Data
const isochroneLegendItems = computed(() => {
    if (props.category === 'education') {
        return [
            { color: '#fde725', label: '5 km' },
            { color: '#b5de2b', label: '10 km' },
            { color: '#6ece58', label: '15 km' },
            { color: '#35b779', label: '20 km' },
            { color: '#1f9e89', label: '25 km' },
            { color: '#26828e', label: '30 km' },
            { color: '#31688e', label: '35 km' },
            { color: '#3e4989', label: '40 km' },
            { color: '#482878', label: '45 km' },
            { color: '#440154', label: '50 km' },
        ];
    } else {
        return [
            { color: '#fde725', label: '10 min' },
            { color: '#c2df23', label: '20 min' },
            { color: '#86d549', label: '30 min' },
            { color: '#52c569', label: '40 min' },
            { color: '#2ab07f', label: '50 min' },
            { color: '#1e9b8a', label: '60 min' },
            { color: '#25858e', label: '70 min' },
            { color: '#2d708e', label: '80 min' },
            { color: '#38588c', label: '90 min' },
            { color: '#433e85', label: '100 min' },
            { color: '#482173', label: '110 min' },
            { color: '#440154', label: '120 min' },
        ];
    }
});

const adminLegendItems = [
    { color: '#ffffd9', label: '90 - 100%' },
    { color: '#edf8b1', label: '80 - 90%' },
    { color: '#c7e9b4', label: '70 - 80%' },
    { color: '#7fcdbb', label: '60 - 70%' },
    { color: '#41b6c4', label: '50 - 60%' },
    { color: '#1d91c0', label: '40 - 50%' },
    { color: '#225ea8', label: '30 - 40%' },
    { color: '#253494', label: '20 - 30%' },
    { color: '#081d58', label: '10 - 20%' },
    { color: '#020b2e', label: '0 - 10%' },
];

onUpdated(() => {

});
</script>

<template>
  <div ref="mapContainer" class="map-container relative">
    <div v-if="!isGlobalView || (isGlobalView && showGlobalIsochrones)" class="legend-overlay bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-lg text-slate-900 dark:text-slate-200 text-xs transition-all duration-300" 
         :class="{ 'w-auto': isLegendExpanded, 'w-10 h-10 p-0 flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800': !isLegendExpanded }">
        
        <!-- Expanded Content -->
        <div v-if="isLegendExpanded">
            <div class="flex justify-between items-center mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500">Legend</span>
                <button @click="isLegendExpanded = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none" title="Collapse">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                    </svg>
                </button>
            </div>




            <!-- Isochrone Legend (ADM0) -->
            <div v-if="adminLevel === 'ADM0'">
                <div class="font-bold mb-2 border-b border-slate-300 dark:border-slate-600 pb-1 flex justify-between items-center">
                    <span>{{ category === 'education' ? 'Travel Distance' : 'Travel Time' }}</span>
                    <span class="text-[10px] font-normal text-slate-500">{{ Math.round(opacity * 100) }}%</span>
                </div>
                
                <!-- Opacity Slider -->
                <div class="mb-2 px-1">
                    <input type="range" v-model="opacity" min="0" max="1" step="0.1" class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-teal-600">
                </div>

                <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div v-for="(item, i) in isochroneLegendItems" :key="i" 
                         class="flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105 select-none"
                         :class="{ 'opacity-30 grayscale': hiddenLegendLabels.has(item.label) }"
                         @click="toggleLegendItem(item.label)">
                        <span class="w-4 h-4 rounded-sm border border-slate-300 dark:border-transparent" :style="{ backgroundColor: item.color }"></span>
                        <span>{{ item.label }}</span>
                    </div>
                </div>
            </div>

            <!-- Admin Boundary Legend (ADM1/2) -->
            <div v-else>
                <div class="font-bold mb-2 border-b border-slate-300 dark:border-slate-600 pb-1 flex justify-between items-center">
                    <span>Population Reached (%)</span>
                   <span class="text-[10px] font-normal text-slate-500">{{ Math.round(opacity * 100) }}%</span> 
                </div>

                <!-- Opacity Slider -->
                 <div class="mb-2 px-1">
                    <input type="range" v-model="opacity" min="0" max="1" step="0.1" class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-teal-600">
                </div>

                <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div v-for="(item, i) in adminLegendItems" :key="i"
                         class="flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105 select-none"
                         :class="{ 'opacity-30 grayscale': hiddenLegendLabels.has(item.label) }"
                         @click="toggleLegendItem(item.label)">
                        <span class="w-4 h-4 rounded-sm border border-slate-300 dark:border-transparent" :style="{ backgroundColor: item.color }"></span>
                        <span>{{ item.label }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Collapsed Icon -->
        <button v-else @click="isLegendExpanded = true" class="w-full h-full flex items-center justify-center text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 focus:outline-none" title="Show Legend">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
               <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
        </button>

    </div>

    <!-- HeiGIT Logo -->
    <a href="https://heigit.org" target="_blank" rel="noopener noreferrer" 
       class="absolute bottom-16 right-2 h-16 z-[5] bg-white/60 backdrop-blur-sm p-1 rounded-md select-none hidden md:block hover:bg-white/80 transition-colors cursor-pointer flex items-center justify-center">
        <img :src="heigitLogo" alt="HeiGIT Logo" class="h-full w-auto" />
    </a>
  </div>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  background-color: #111;
  position: relative;
}

.legend-overlay {
    position: absolute;
    top: 145px;
    left: 20px;
    z-index: 10;

    min-width: 140px;
}
</style>
