

<script setup lang="ts">
import { ref } from 'vue';

defineEmits<{
  (e: 'close'): void;
}>();

// Toggle State
const showAllPapers = ref(false);

const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

// --- Data: Papers ---
const corePapers = [
  { 
    title: "Changes in Road Centrality and Hospital Access Redundancy: Impacts of the 2024 Flood in Porto Alegre",
    authors: "Ruiz Sánchez, R., et al. (2025)",
    journal: "AGILE: GIScience Series",
    link: "https://doi.org/10.5194/agile-giss-6-10-2025"
  },
  { 
    title: "Assessing road criticality and loss of healthcare accessibility during floods (Cyclone Idai)",
    authors: "Petricola, S., et al. (2022)",
    journal: "Int. Journal of Health Geographics",
    link: "https://doi.org/10.1186/s12942-022-00315-2"
  },
  { 
    title: "Flood Impact assessment on road network and healthcare access in Jakarta",
    authors: "Klipper, I. G., et al. (2021)",
    journal: "AGILE: GIScience Series",
    link: "https://doi.org/10.5194/agile-giss-2-4-2021"
  },
  { 
    title: "Mapping physical access to health care for older adults in sub-Saharan Africa",
    authors: "Geldsetzer, P., et al. (2020)",
    journal: "The Lancet. Healthy Longevity",
    link: "https://doi.org/10.1016/S2666-7568(20)30010-6"
  }
];

const secondaryPapers = [
  { 
    title: "Crime-associated inequality in geographical access to education: Insights from Rio de Janeiro",
    authors: "Knoblauch, S., et al. (2025)",
    journal: "Cities",
    link: "https://doi.org/10.1016/j.cities.2025.105818"
  },
  { 
    title: "Accessibility for pedestrians under heat stress - the example of Heidelberg, Germany",
    authors: "Huber, J., et al. (2025)",
    journal: "AGILE: GIScience Series",
    link: "https://doi.org/10.5194/agile-giss-6-4-2025"
  }
];
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

    <div class="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-slate-900/5 dark:ring-white/10">
      
      <div class="flex items-center justify-between px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 shrink-0">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Open Access Lens</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Global Physical Accessibility Monitor</p>
        </div>
        <button 
          @click="$emit('close')"
          class="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="overflow-y-auto px-8 py-8 space-y-10 text-slate-600 dark:text-slate-300 leading-relaxed scroll-smooth">
        
        <section class="prose dark:prose-invert max-w-none">
          <p class="text-lg leading-relaxed text-slate-700 dark:text-slate-200">
            <strong>Open Access Lens</strong> delivers high-resolution insights into global spatial accessibility, visualizing the gap in healthcare and education coverage. Developed by <strong>HeiGIT</strong>, this data empowers decision-makers to identify underserved populations.
          </p>
          
          <div class="not-prose mt-6 bg-teal-50 dark:bg-teal-900/20 p-5 rounded-xl border border-teal-100 dark:border-teal-800/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h4 class="font-bold text-teal-900 dark:text-teal-100 text-sm uppercase tracking-wider">Data Download</h4>
              <p class="text-sm text-teal-700 dark:text-teal-300 mt-1">Access datasets used in this dashboard via HDX.</p>
            </div>
            <button 
              @click="openLink('https://data.humdata.org/organization/heidelberg-institute-for-geoinformation-technology')"
              class="shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              View on HDX
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </button>
          </div>
        </section>

        <hr class="border-slate-200 dark:border-slate-800" />

        <section>
          <div class="flex items-center gap-2 mb-4">
             <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
               <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.447-.894L15 7m0 13V7" /></svg>
             </div>
             <h3 class="text-xl font-bold text-slate-900 dark:text-white">Method</h3>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
              <p>
                Our analysis pipeline leverages the power of open-source tools to quantify who is left behind by certain services. Using <strong>openrouteservice</strong> with the <strong>OpenStreetMap (OSM)</strong> road network, we calculate travel-time <strong>isochrones</strong> representing areas reachable by car within specific limits.
              </p>
              <p>
                These accessibility zones are overlaid with <strong>WorldPop</strong> population estimates (100m resolution) to calculate coverage. The unit of analysis is defined by geoBoundaries country borders, and where available, we summarize results at finer administrative levels (ADM 1–2).
              </p>
              <ul class="space-y-2 mt-2">
                <li class="flex items-start gap-2 text-sm">
                  <span class="text-teal-500 mt-1">●</span>
                  <span><strong>Healthcare:</strong> Population within 10–120 min drive-time.</span>
                </li>
                <li class="flex items-start gap-2 text-sm">
                  <span class="text-teal-500 mt-1">●</span>
                  <span><strong>Education:</strong> Population within 5–50 km travel distance.</span>
                </li>
              </ul>
          </div>
        </section>

        <section class="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-6 border border-amber-100 dark:border-amber-800/30">
          <h3 class="text-lg font-bold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Limitations & Constraints
          </h3>
          <ul class="space-y-2 text-sm text-amber-900/80 dark:text-amber-100/80 list-disc list-inside">
            <li><strong>OSM Completeness:</strong> In regions with unmapped roads, accessibility may be underestimated.</li>
            <li><strong>Population Models:</strong> WorldPop estimates are statistical models, not direct census counts.</li>
            <li><strong>Idealized Travel:</strong> Isochrones assume standard speeds and do not account for traffic, weather, or road quality.</li>
          </ul>
        </section>

        <section>
           <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-4">Papers & References</h3>
           
           <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
             <a v-for="(paper, i) in corePapers" :key="`core-${i}`" :href="paper.link" target="_blank" 
                class="group block p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-800/50">
               <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                 {{ paper.title }}
               </h4>
               <p class="text-xs text-slate-500 mt-2">
                 {{ paper.authors }} — <span class="italic">{{ paper.journal }}</span>
               </p>
             </a>

             <template v-if="showAllPapers">
                <a v-for="(paper, i) in secondaryPapers" :key="`sec-${i}`" :href="paper.link" target="_blank" 
                    class="group block p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-800/50">
                <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {{ paper.title }}
                </h4>
                <p class="text-xs text-slate-500 mt-2">
                    {{ paper.authors }} — <span class="italic">{{ paper.journal }}</span>
                </p>
                </a>
             </template>
           </div>
           
           <div class="mt-4 text-center">
             <button 
                @click="showAllPapers = !showAllPapers"
                class="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors focus:outline-none"
             >
                {{ showAllPapers ? 'Show Less' : 'Show More Related Work' }}
                <svg v-if="!showAllPapers" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
             </button>
           </div>
        </section>

      </div>

      <div class="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 p-6 shrink-0">
        <p class="text-sm text-center text-slate-500 dark:text-slate-400">
          Have a use-case? Contact us at <a href="mailto:communications@heigit.org" class="text-teal-600 hover:underline font-bold">communications@heigit.org</a>
        </p>
      </div>
      
    </div>
  </div>
</template>