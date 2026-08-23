<script setup lang="ts">
import { ref } from 'vue';
import CountryDropdown from './CountryDropdown.vue';


defineProps<{
  countries: { label: string; value: string }[];
  categories: { label: string; value: string }[];
  selectedCategory: string;
  isGlobalIsochrones: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-country', value: string): void;
  (e: 'update:selectedCategory', value: string): void;
  (e: 'update:isGlobalIsochrones', value: boolean): void;
  (e: 'open-about'): void;
}>();

const isCollapsed = ref(false); // New State

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
                 <a href="#" @click.prevent="emit('open-about')" class="text-sm font-medium text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 transition-colors mr-2">About</a>

                <button @click="toggleCollapse" class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                    <svg v-if="!isCollapsed" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
            </div>
        </div>

        <!-- Expanded Controls Area -->
        <div v-if="!isCollapsed" class="px-6 pb-4 pt-0 flex flex-col md:flex-row gap-4 items-center md:items-end justify-center border-t border-slate-100 dark:border-slate-800/50 mt-1">
             <div class="flex flex-col md:flex-row gap-4 w-full md:w-auto items-end">
                <!-- Country Search -->
                <CountryDropdown
                    :countries="countries"
                    label="Select a Country"
                    display-text="Select a Country"
                    search-placeholder="Search..."
                    container-class="w-full md:w-64"
                    menu-class="w-full max-h-[300px]"
                    @select="emit('select-country', $event)"
                />

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
</template>
