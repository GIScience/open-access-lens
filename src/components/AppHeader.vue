```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import AboutModal from './AboutModal.vue';


const props = defineProps<{
  // isDarkMode?: boolean;
  countries: { label: string; value: string }[];
  categories: { label: string; value: string }[];
  selectedCategory: string;
  isGlobalIsochrones: boolean;
}>();

const emit = defineEmits<{
  // (e: 'toggle-theme'): void;
  (e: 'select-country', value: string): void;
  (e: 'update:selectedCategory', value: string): void;
  (e: 'update:isGlobalIsochrones', value: boolean): void;
}>();

const isDropdownOpen = ref(false);
const searchQuery = ref('');
const isCollapsed = ref(false); // New State
const isAboutOpen = ref(false);

const filteredCountries = computed(() => {
    if (!searchQuery.value) return props.countries;
    const q = searchQuery.value.toLowerCase();
    return props.countries.filter(c => c.label.toLowerCase().includes(q));
});

const selectedCountryLabel = computed(() => {
    return 'Select a Country';
});

const toggleDropdown = () => {
    isDropdownOpen.value = !isDropdownOpen.value;
    if (isDropdownOpen.value) {
        setTimeout(() => {
            document.getElementById('country-search-input')?.focus();
        }, 50);
    }
};

const selectCountry = (value: string) => {
    emit('select-country', value);
    isDropdownOpen.value = false;
};

// Toggle Global Isochrones
const toggleGlobalIsochrones = (e: Event) => {
    const target = e.target as HTMLInputElement;
    emit('update:isGlobalIsochrones', target.checked);
};

const toggleCollapse = () => {
    isCollapsed.value = !isCollapsed.value;
};

</script>

<template>
    <div class="w-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-sm z-50 transition-all duration-300">
        
        <!-- Top Bar: Title + Collapse Toggle + About -->
        <div class="px-6 py-3 relative flex items-center justify-center">
            <!-- Center Title -->
            <div class="text-center z-0">
                <h1 class="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    Open Access Lens
                </h1>
                <p v-if="!isCollapsed" class="text-xs text-slate-500 dark:text-slate-400 font-medium">Mapping physical access to essential services</p>
            </div>
            
            <!-- Right Controls (Absolute) -->
            <div class="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4 z-10">
                 <!-- About Link -->
                 <a href="#" @click.prevent="isAboutOpen = true" class="text-sm font-medium text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 transition-colors mr-2">About</a>

                <button @click="toggleCollapse" class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                    <svg v-if="!isCollapsed" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                 <!-- Theme Toggle (Always Visible) - REMOVED -->
                <!-- <button 
                    @click="emit('toggle-theme')" 
                    class="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Toggle Theme"
                >
                    <span v-if="isDarkMode" class="text-sm">☀️</span>
                    <span v-else class="text-sm">🌙</span>
                </button> -->
            </div>
        </div>

        <!-- Expanded Controls Area -->
        <div v-if="!isCollapsed" class="px-6 pb-4 pt-0 flex flex-col md:flex-row gap-4 items-center md:items-end justify-center border-t border-slate-100 dark:border-slate-800/50 mt-1">
             <div class="flex flex-col md:flex-row gap-4 w-full md:w-auto items-end">
                <!-- Country Search -->
                <div class="relative w-full md:w-64 text-left">
                    <label class="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Select a Country</label>
                    <div 
                        @click="toggleDropdown"
                        class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md px-3 py-2 text-sm cursor-pointer flex justify-between items-center text-slate-700 dark:text-slate-200 shadow-sm"
                    >
                        <span class="truncate">{{ selectedCountryLabel }}</span>
                        <span class="text-slate-500 text-xs">▼</span>
                    </div>

                    <!-- Dropdown Menu -->
                    <div v-if="isDropdownOpen" class="absolute top-full left-0 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-xl max-h-[300px] flex flex-col z-50">
                        <div class="p-2 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-md">
                            <input 
                                id="country-search-input"
                                v-model="searchQuery" 
                                placeholder="Search..." 
                                class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            />
                        </div>
                        <div class="overflow-y-auto flex-1">
                            <div 
                                v-for="c in filteredCountries" 
                                :key="c.value"
                                @click="selectCountry(c.value)"
                                class="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between text-slate-700 dark:text-slate-200"
                            >
                                {{ c.label }}
                            </div>
                            <div v-if="filteredCountries.length === 0" class="p-3 text-slate-500 text-sm text-center">
                                No matches found
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Global Isochrones Toggle -->
                <div class="flex flex-col items-start">
                    <label class="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Global Layers</label>
                    <div class="flex items-center h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 shadow-sm">
                        <input 
                            type="checkbox" 
                            id="global-iso" 
                            :checked="isGlobalIsochrones" 
                            @change="toggleGlobalIsochrones"
                            class="mr-2 rounded text-teal-600 focus:ring-teal-500"
                        >
                        <label for="global-iso" class="text-sm text-slate-700 dark:text-slate-200 cursor-pointer select-none">Show Isochrones</label>
                    </div>
                </div>

                <!-- Category (Visible only if Isochrones checked) -->
                <div class="flex flex-col w-48 text-left" v-if="isGlobalIsochrones">
                    <label class="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Category</label>
                    <select 
                        :value="selectedCategory" 
                        @change="emit('update:selectedCategory', ($event.target as HTMLSelectElement).value)"
                        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-500 w-full shadow-sm"
                    >
                        <option v-for="c in categories" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <AboutModal v-if="isAboutOpen" @close="isAboutOpen = false" />
</template>
