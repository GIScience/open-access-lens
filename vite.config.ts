import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split out vendor code that's needed on every page load (the map
        // renders on Home, before any country is picked) into its own
        // cacheable chunks, separate from app code that changes more
        // often. Deliberately leaves plotly.js-dist/duckdb-wasm/
        // apache-arrow alone here - those are only pulled in by
        // ChartPanel's dynamic import (see DashboardView.vue) and Rollup
        // already puts them in their own on-demand chunk for that; folding
        // them into a manual chunk here would undo that split.
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl/') || id.includes('node_modules/pmtiles/')) {
            return 'maplibre';
          }
          if (id.includes('node_modules/vue/') || id.includes('node_modules/vue-router/') || id.includes('node_modules/@vue/')) {
            return 'vue-vendor';
          }
        },
      },
    },
  },
  base: '/open-access-lens/'
})
