<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

// Shared searchable country dropdown, used by both AppHeader (Home view)
// and DashboardView (Dashboard view) - the two used to have near-identical
// copies of this same search/filter/click-outside logic and markup, with
// only styling and selected-state highlighting differing between them.
const props = defineProps<{
  countries: { label: string; value: string }[];
  label: string;
  displayText: string;
  selectedValue?: string;
  searchPlaceholder?: string;
  containerClass?: string;
  menuClass?: string;
}>();

const emit = defineEmits<{
  (e: 'select', value: string): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const containerRef = ref<HTMLElement | null>(null);

const filteredCountries = computed(() => {
    if (!searchQuery.value) return props.countries;
    const q = searchQuery.value.toLowerCase();
    return props.countries.filter(c => c.label.toLowerCase().includes(q));
});

const toggle = () => {
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        setTimeout(() => {
            containerRef.value?.querySelector('input')?.focus();
        }, 50);
    }
};

const select = (value: string) => {
    emit('select', value);
    isOpen.value = false;
    searchQuery.value = '';
};

const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
        isOpen.value = false;
    }
};

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
    <div class="relative text-left" :class="containerClass" ref="containerRef">
        <label class="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">{{ label }}</label>
        <div
            @click="toggle"
            class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md px-3 py-2 text-sm cursor-pointer flex justify-between items-center text-slate-700 dark:text-slate-200 shadow-sm"
        >
            <span class="truncate">{{ displayText }}</span>
            <span class="text-slate-500 text-xs text-right ml-2">▼</span>
        </div>

        <div v-if="isOpen" class="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-xl flex flex-col z-50" :class="menuClass">
            <div class="p-2 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-md">
                <input
                    v-model="searchQuery"
                    :placeholder="searchPlaceholder || 'Search...'"
                    class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                />
            </div>
            <div class="overflow-y-auto flex-1">
                <div
                    v-for="c in filteredCountries"
                    :key="c.value"
                    @click="select(c.value)"
                    class="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between text-slate-700 dark:text-slate-200"
                    :class="{'bg-teal-50 dark:bg-slate-700/50 text-teal-600 dark:text-teal-400 font-medium': c.value === selectedValue}"
                >
                    {{ c.label }}
                    <span v-if="c.value === selectedValue">✓</span>
                </div>
                <div v-if="filteredCountries.length === 0" class="p-3 text-slate-500 text-sm text-center">
                    No matches found
                </div>
            </div>
        </div>
    </div>
</template>
