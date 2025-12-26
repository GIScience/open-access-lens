<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IsochroneMap from '../components/IsochroneMap.vue';
import AppHeader from '../components/AppHeader.vue';
import ChartPanel from '../components/ChartPanel.vue';
import AboutModal from '../components/AboutModal.vue';
import yaml from 'js-yaml';
import { COUNTRIES_URL } from '../config';

// Router setup
const route = useRoute();
const router = useRouter();

// --- State & Data ---
const countries = ref<{value: string, label: string}[]>([]);
const isLoadingCountries = ref(true);

// Searchable Dropdown State
const isDropdownOpen = ref(false);
const searchQuery = ref('');
const dropdownRef = ref<HTMLElement | null>(null);
const isAboutOpen = ref(false);

const selectedCountry = ref(''); // Default to empty (Global View)
const mapCountry = ref(''); // Internal state for Map to control timing
const selectedCategory = ref('education');
const selectedAdminLevel = ref('ADM0');
const selectedPopulationType = ref('total');
const selectedRange = ref(5000); // Default

const chartData = ref<any[]>([]);
// 1. Checks system preference. Default to Dark if undefined or not strictly light.
const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
const isDarkMode = ref(!prefersLight);

// 2. Single source of truth function
const applyTheme = (dark: boolean) => {
    if (dark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

const toggleTheme = () => { 
    isDarkMode.value = !isDarkMode.value;
};

// 3. Watcher ensures UI and DOM are always in sync (cleaner than putting logic in toggle function)
watch(isDarkMode, (newVal) => {
    applyTheme(newVal);
}, { immediate: true });

// --- Constants ---
const categories = [
  { value: 'education', label: 'Education' },
  { value: 'hospitals', label: 'Hospitals' },
  { value: 'primary_healthcare', label: 'Primary Healthcare' }
];

const adminLevels = [
  { value: 'ADM0', label: 'Country / Admin 0' },
  { value: 'ADM1', label: 'Admin 1' },
  { value: 'ADM2', label: 'Admin 2' }
];



// --- Computed ---
const ranges = computed(() => {
  if (selectedCategory.value === 'education') {
    return [
      { value: 5000, label: '5 km' },
      { value: 10000, label: '10 km' },
      { value: 20000, label: '20 km' },
      { value: 30000, label: '30 km' },
      { value: 45000, label: '45 km' }
    ];
  } else {
    return [
      { value: 600, label: '10 min' },
      { value: 1200, label: '20 min' },
      { value: 1800, label: '30 min' },
      { value: 2400, label: '40 min' },
      { value: 3600, label: '60 min' },
      { value: 5400, label: '90 min' },
      { value: 6000, label: '100 min' },
      { value: 6600, label: '110 min' },
      { value: 7200, label: '120 min' }
    ];
  }
});

const filteredCountries = computed(() => {
  if (!searchQuery.value) return countries.value;
  const q = searchQuery.value.toLowerCase();
  return countries.value.filter(c => c.label.toLowerCase().includes(q));
});

const selectedCountryLabel = computed(() => {
  const c = countries.value.find(c => c.value === selectedCountry.value);
  return c ? c.label : 'Select Country';
});

// --- Methods ---
const fetchCountries = async () => {
  try {
    const response = await fetch(COUNTRIES_URL);
    const text = await response.text();
    const data = yaml.load(text) as Record<string, any>;
    
    // Filter for Africa and Central America
    const validRegions = ['africa', 'central-america', 'asia', 'europe', 'north-america','south-america', 'australia-oceania'];
    const filteredCountries = Object.entries(data)
      .filter(([_, val]) => validRegions.includes(val.region) || val.slug === 'central-america')
      .map(([code, val]) => ({
        value: code.toLowerCase(),
        label: val.name || (val.slug.charAt(0).toUpperCase() + val.slug.slice(1)) 
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    countries.value = filteredCountries;
    
    // Sync with Route
    const routeCountry = Array.isArray(route.params.country) ? route.params.country[0] : route.params.country;
    
    // Handle /isochrones specifically
    if (route.path === '/isochrones') {
        selectedCountry.value = '';
        isGlobalIsochrones.value = true;
    } 
    else if (routeCountry && countries.value.find(c => c.value === routeCountry.toLowerCase())) {
        selectedCountry.value = routeCountry.toLowerCase();
        isGlobalIsochrones.value = false;
    } else {
        // Fallback or Home
        if (route.path === '/' || route.path === '') {
             // Home Mode - No selection
             selectedCountry.value = '';
             isGlobalIsochrones.value = false;
        } else {
             // If we are here, it matches /:country but not in list. 
             // Possibly user typed garbage. Redirect to home or fallback?
             // Safest is home for now to avoid broken state
             router.replace('/');
        }
    }

  } catch (e) {
    console.error('Failed to load countries:', e);
    countries.value = [{ value: 'rwa', label: 'Rwanda (Fallback)' }];
  } finally {
    isLoadingCountries.value = false;
  }
};

// --- View Mode Logic ---
const viewMode = ref<'HOME' | 'DASHBOARD'>('HOME');
const isGlobalIsochrones = ref(false); // Added missing ref


// Watch selectedCountry to handle back navigation (DASHBOARD -> HOME)
// Watch selectedCountry to handle back navigation (DASHBOARD -> HOME)
watch(selectedCountry, (newVal) => {
    if (newVal) {
        // SELECTING A COUNTRY
        if (viewMode.value === 'HOME') {
            // 1. Start Sidebar Transition
            viewMode.value = 'DASHBOARD'; 
            // 2. Delay Map Prop Update until sidebar is mostly open
            setTimeout(() => {
                mapCountry.value = newVal; 
            }, 750);
        } else {
            // Already in dashboard, switch immediately
            mapCountry.value = newVal;
        }
    } else {
        // CLEARING / HOME
        viewMode.value = 'HOME';
        mapCountry.value = ''; // Reset immediately
    }
});

const selectCountry = (iso: string) => {
    if (!iso) {
        selectedCountry.value = '';
        isDropdownOpen.value = false;
        searchQuery.value = '';
        return;
    }
    // Update data but DO NOT switch mode yet. Wait for map zoom.
    selectedCountry.value = iso;
    isDropdownOpen.value = false;
    searchQuery.value = '';
    
    // View mode switch is handled by the watcher on selectedCountry now
};

const goHome = () => {
    router.push('/');
};

// Called when MapCanvas finishes its automated zoom to the country
const onMapMoveEnd = () => {
    // No-op now, handled by timing
};

const handleDataUpdate = (data: any[]) => {
    chartData.value = data;
};

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
  if (isDropdownOpen.value) {
    // Focus input next tick?
    setTimeout(() => {
      const input = document.getElementById('country-search-input');
      if (input) input.focus();
    }, 50);
  }
};



const selectedDistrict = ref<string | null>(null);

const handleDistrictSelection = (id: string) => {
    // Switch to Admin 1 View
    selectedAdminLevel.value = 'ADM1';
    selectedDistrict.value = id;
    
    // Future: Trigger Zoom if we have bounds (Requires Geometry or Tile Query)
    console.log("Ranking Clicked - Switched to ADM1. District ID:", id);
};

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isDropdownOpen.value = false;
  }
};

// --- Lifecycle & Watchers ---
onMounted(() => {
  fetchCountries();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Watch Ranges -> Auto-select
watch(ranges, (newRanges) => {
    if (newRanges.length > 0 && newRanges[0]) {
        selectedRange.value = newRanges[0].value;
    }
}, { immediate: true });

// Auto-select minimum range when admin level changes to ADM1/ADM2
watch(selectedAdminLevel, (newLevel) => {
  if (newLevel !== 'ADM0') {
    setTimeout(() => {
        if (ranges.value.length > 0 && ranges.value[0]) {
            selectedRange.value = ranges.value[0].value;
        }
    }, 50);
  }
});

// Route Sync
watch(() => route.path, (newPath) => {
    if (newPath === '/isochrones') {
        selectedCountry.value = '';
        isGlobalIsochrones.value = true;
        // viewMode handles itself via selectedCountry watcher (if country='' -> HOME)
    } else if (newPath === '/') {
        selectedCountry.value = '';
        isGlobalIsochrones.value = false;
    } else {
        // Check params for country
        const c = Array.isArray(route.params.country) ? route.params.country[0] : route.params.country;
        if (c && countries.value.find(val => val.value === c.toLowerCase())) {
            selectedCountry.value = c.toLowerCase();
            isGlobalIsochrones.value = false;
        }
    }
});

watch(selectedCountry, (newVal) => {
    if (newVal) router.push(`/${newVal}`);
});
const year = new Date().getFullYear();
</script>

<template>
  <div class="h-screen w-full overflow-hidden font-sans flex flex-col relative">
    
    <!-- MAIN SPLIT CONTAINER -->
    <div class="flex-1 flex flex-row relative min-h-0 w-full">

        <!-- LEFT PANE: MAP & CONTROLS (Transitions width: 100% -> 50%) -->
        <div 
            class="relative h-full flex flex-col transition-[width] duration-700 ease-in-out border-r border-slate-200 dark:border-slate-800"
            :class="viewMode === 'HOME' ? 'w-full' : 'w-full md:w-1/2'"
        >
            <!-- 1. HEADER OVERLAY -->
            <!-- Positioned absolutely on top of the map -->
            <div class="absolute top-0 left-0 w-full z-20 pointer-events-auto">
                 
                 <!-- HOME Header -->
                 <transition name="fade">
                    <div v-if="viewMode === 'HOME'">
                         <AppHeader 
                            :is-dark-mode="isDarkMode"
                            :countries="countries"
                            :categories="categories"
                            :selected-category="selectedCategory"
                            :is-global-isochrones="isGlobalIsochrones"
                            @toggle-theme="toggleTheme"
                            @select-country="selectCountry"
                            @update:selected-category="selectedCategory = $event"
                            @update:is-global-isochrones="isGlobalIsochrones = $event"
                        />
                    </div>
                 </transition>

                 <!-- DASHBOARD Header (Compact) -->
                 <transition name="slide-down">
                    <div v-if="viewMode === 'DASHBOARD'" class="flex flex-col gap-4 p-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
                        <!-- Controls Flex Container -->
                        <div class="flex flex-row w-full items-end justify-between gap-2">
                            
                            <!-- LEFT: Nav & Filters -->
                            <div class="flex flex-row flex-wrap gap-2 items-end flex-1">
                                <!-- Home Button -->
                                 <button 
                                    @click="goHome" 
                                    class="h-[38px] w-[38px] flex-none flex items-center justify-center bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors text-teal-700 dark:text-teal-400"
                                    title="Back to Home"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                </button>

                                <!-- Custom Searchable Country Dropdown -->
                                <div class="relative flex-1 min-w-[140px]" ref="dropdownRef">
                                    <label class="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Country</label>
                                    <div 
                                        @click="toggleDropdown"
                                        class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md px-3 py-2 text-sm cursor-pointer flex justify-between items-center text-slate-700 dark:text-slate-200 shadow-sm"
                                    >
                                        <span class="truncate">{{ selectedCountryLabel }}</span>
                                        <span class="text-slate-500 text-xs text-right ml-2">▼</span>
                                    </div>

                                    <!-- Dropdown Menu -->
                                    <div v-if="isDropdownOpen" class="absolute top-full left-0 mt-1 w-[260px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-xl max-h-[400px] flex flex-col z-50">
                                        <div class="p-2 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-md">
                                            <input 
                                                id="country-search-input"
                                                v-model="searchQuery" 
                                                placeholder="Search countries..." 
                                                class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                                            />
                                        </div>
                                        <div class="overflow-y-auto flex-1">
                                            <div 
                                                v-for="c in filteredCountries" 
                                                :key="c.value"
                                                @click="selectCountry(c.value)"
                                                class="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between text-slate-700 dark:text-slate-200"
                                                :class="{'bg-teal-50 dark:bg-slate-700/50 text-teal-600 dark:text-teal-400 font-medium': c.value === selectedCountry}"
                                            >
                                                {{ c.label }}
                                                <span v-if="c.value === selectedCountry">✓</span>
                                            </div>
                                            <div v-if="filteredCountries.length === 0" class="p-3 text-slate-500 text-sm text-center">
                                                No matches found
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Category -->
                                <div class="flex flex-col flex-1 min-w-[120px]">
                                    <label class="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Service</label>
                                    <select v-model="selectedCategory" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-500 w-full shadow-sm">
                                        <option v-for="c in categories" :key="c.value" :value="c.value">{{ c.label }}</option>
                                    </select>
                                </div>

                                <!-- Admin Level -->
                                <div class="flex flex-col flex-1 min-w-[100px]">
                                    <label class="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Scale</label>
                                    <select v-model="selectedAdminLevel" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-500 w-full shadow-sm">
                                        <option v-for="l in adminLevels" :key="l.value" :value="l.value">{{ l.label }}</option>
                                    </select>
                                </div>
                            </div>

                            <!-- RIGHT: Utilities -->
                            <div class="flex flex-row gap-2 items-end shrink-0 ml-2">
                                <!-- About Link (Icon) -->
                                <button 
                                    @click="isAboutOpen = true" 
                                    class="h-[38px] w-[38px] flex-none flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200"
                                    title="About & Methodology"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                </button>

                                <!-- Theme Toggle -->
                                <button 
                                    @click="toggleTheme" 
                                    class="h-[38px] w-[38px] flex-none flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200"
                                    title="Toggle Theme"
                                >
                                    <span v-if="isDarkMode">☀️</span>
                                    <span v-else>🌙</span>
                                </button>
                            </div>

                        </div>
                    </div>
                 </transition>
            </div>

            <!-- 2. MAP CANVAS -->
            <!-- Fills the left pane -->
            <div class="flex-1 relative z-10 w-full min-h-0 bg-slate-100 dark:bg-slate-900">
                 <IsochroneMap 
                      :country="mapCountry" 
                      :category="selectedCategory" 
                      :admin-level="selectedAdminLevel"
                      :selected-range="selectedRange"
                      :stats-data="chartData" 
                      :selected-district="selectedDistrict"
                      :is-global-view="viewMode === 'HOME'"
                      :show-global-isochrones="isGlobalIsochrones"
                      :available-countries="countries"
                      @select-country="selectCountry"
                      @map-move-end="onMapMoveEnd"
                    />
            </div>
        </div>

        <!-- RIGHT PANE: CHART PANEL (Transitions width: 0% -> 50%) -->
        <div 
            class="relative h-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden transition-[width] duration-700 ease-in-out"
            :class="viewMode === 'HOME' ? 'w-0' : 'w-full md:w-1/2'"
        >
             <div class="flex-1 overflow-hidden p-4 h-full min-w-[320px]">
                 <ChartPanel 
                  :country="selectedCountry" 
                  :country-name="selectedCountryLabel"
                  :category="selectedCategory" 
                  :admin-level="selectedAdminLevel"
                  :population-type="selectedPopulationType"
                  v-model:selected-range="selectedRange"
                  @data-updated="handleDataUpdate"
                  @district-selected="handleDistrictSelection"
                />
             </div>
        </div>
    </div>
    
    <!-- Footer -->
    <footer class="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-3 px-6 flex flex-row justify-between items-center text-xs text-slate-500 dark:text-slate-400 z-50 whitespace-nowrap overflow-x-auto scrollbar-hide shrink-0">
        <div class="flex gap-4">
            <a href="https://heigit.org/contact/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Contact</a>
            <a href="https://heigit.org/privacy-policy/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Privacy Policy</a>
            <a href="https://heigit.org/imprint/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Imprint</a>
        </div>
        <div class="font-bold uppercase tracking-wider ml-4">
            {{ year }} &copy; HEIGIT
        </div>
    </footer>
    <AboutModal v-if="isAboutOpen" @close="isAboutOpen = false" />
  </div>
</template>

<style>
/* Global resets handled by Tailwind, ensuring full height */
html, body, #app {
  height: 100%;
  width: 100%;
  margin: 0;
  overflow: hidden;
}

/* Transitions */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.4s ease, opacity 0.4s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.4s ease, opacity 0.4s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
