<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol, PMTiles } from 'pmtiles';
import heigitLogo from '../assets/HeiGIT_Logo_compact.svg';
import { TILES_BASE_URL, BASEMAP_STYLE, ADMIN_COLORS_10, buildIsochroneColorSteps, getIsochroneLegendItems, buildAdminColorSteps, getAdminLegendItems } from '../config';
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
    if (!style) return;
    (style.layers || []).forEach(l => {
        if (l.id.startsWith('global-iso-')) {
            map?.removeLayer(l.id);
        }
    });
    Object.keys(style.sources || {}).forEach(s => {
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
// True while the global<->local pane-width transition is settling (see the
// isGlobalView watcher below). Blocks the structural-change watcher's
// immediate updateMapData() from racing the delayed, properly-resized one.
const isViewTransitioning = ref(false);

const localStats = ref<any[]>([]);
const currentAdminLayerName = ref<string>('');
const isZoomingToCountry = ref(false);

const opacity = ref(0.85); // Default updated to 0.85
const hiddenLegendLabels = ref<Set<string>>(new Set());

// --- CONCURRENCY & CACHING ---
const currentUpdateId = ref(0);
const layerNameCache = new Map<string, string>(); // Cache detected layer names by ISO

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
    const isHidden = (lbl: string) => hiddenLegendLabels.value.has(lbl);
    const steps = buildIsochroneColorSteps(props.category, isHidden);

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
         const adminSteps = buildAdminColorSteps(isHidden);
         map.setPaintProperty('admin-boundaries-fill-layer', 'fill-color', adminSteps as any);
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

  // Mac-style Trackpad Panning: Map Wheel (2-finger scroll) to Pan
      map.on('load', () => {
      // Basic load event
      // Removed custom wheel event that caused jumpy zooming: MapLibre natively handles scroll zoom.
      // Ensure data is loaded initially
      updateMapData();

      // No manual ResizeObserver here: MapLibre already runs its own,
      // internally debounced (~50ms) one by default (trackResize, on
      // unless explicitly disabled). A second, un-throttled observer
      // calling map.resize() synchronously on every raw layout tick here
      // was fighting the library's own debounced one on the same
      // container - two resize handlers racing on the same canvas is what
      // caused the black flicker on both plain browser-window resize and
      // the pane-width transition.
  });

// Watch Global View changes (for transitions)
// The sidebar's CSS width transition (duration-700) starts the moment this
// fires, and the ResizeObserver below calls map.resize() continuously
// throughout it. Running the full layer/source rebuild (updateMapData) and
// camera fit while that's happening was causing the canvas to flash black
// during the local <-> global transition - so both are delayed until the
// transition has settled, matching duration-700 plus a small buffer.
// (This also replaces an old map.setStyle(BASEMAP_STYLE) call here, a
// leftover from removed dark-mode logic: BASEMAP_STYLE is a single
// constant now, so that reload was pure waste, forcing a full basemap
// tile/sprite/glyph refetch on every toggle for no reason.)
watch(() => props.isGlobalView, (isGlobal) => {
    if (!map) return;

    // Block the structural-change watcher below (it also depends on
    // isGlobalView/country) from firing its own immediate updateMapData()
    // against a canvas that's still mid pane-width transition.
    isViewTransitioning.value = true;

    setTimeout(() => {
        if (!map) return;

        // Ensure the map's internal canvas size matches the now-settled
        // container before doing anything else with it.
        map.resize();

        updateMapData();
        isViewTransitioning.value = false;

        if (isGlobal) {
            // Since the map is full-width again, this centers perfectly.
            map.fitBounds([[-170, -50], [170, 80]], {
                padding: 0,
                animate: true,
                duration: 2000
            });
        }
    }, 750); // Match this to the CSS 'duration-700' pane transition + buffer
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
          const featureProperties = feature.properties;
          
          const name = featureProperties?.NAME || featureProperties?.name || featureProperties?.ADMIN || 'Unknown';
          const iso = featureProperties?.ISO_A3 || featureProperties?.iso_a3 || featureProperties?.ADM0_A3 || featureProperties?.adm0_a3 || featureProperties?.sov_a3 || 'N/A';
          
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

  map.on('mouseleave', 'global-boundaries-fill', () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      globalPopup.remove();
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
          const featureProperties = feature.properties;
          const iso = featureProperties?.ISO_A3 || featureProperties?.iso_a3 || featureProperties?.ADM0_A3 || featureProperties?.adm0_a3 || featureProperties?.sov_a3;
          
          if (iso && iso !== 'N/A' && iso !== '-99') {
              const bounds = getBbox(feature);

              // Emit selection immediately so DashboardView starts opening
              // the chart sidebar right away (feels responsive).
              emit('select-country', iso);

              // But wait for that sidebar's CSS width transition (700ms, see
              // DashboardView.vue's duration-700 pane classes) to finish
              // before fitting bounds. fitBounds computes its target against
              // the map container's size *at call time* - firing it while
              // the container is still animating from full width down to
              // half width fits the wrong (larger) width, so the country
              // ends up cropped/shifted once the sidebar finishes opening.
              if (bounds && map) {
                  setTimeout(() => {
                      if (!map) return;
                      isZoomingToCountry.value = true; // Set flag
                      map.fitBounds(bounds as [number, number, number, number], {
                          padding: { top: 50, bottom: 50, left: 50, right: 50 },
                          duration: 2000,
                          essential: true,
                          animate: true
                      });
                  }, 700);
              }
          }
      }
  });
});



const setupIsochronesLayer = (layerId: string) => {
  // ... (Existing setupIsochronesLayer logic - no changes needed for theme unless outline color needs tweaking)
  if (!map) return;
  
  // Dynamic Coloring based on Category
  const steps = buildIsochroneColorSteps(props.category);

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

// Builds the admin-boundary fill-color match expression from stats data.
// Shared by setupAdminLayers (initial layer creation) and the range-only
// repaint path, so a range change can recolor via setPaintProperty without
// tearing down and rebuilding the whole layer/source.
const buildAdminFillColorExpression = (stats: StatsData[] | undefined | null): any => {
    if (!stats || stats.length === 0) return '#333333';

    const matchExpression: any[] = ['match', ['to-string', ['get', 'id']]];

    stats.forEach((stat: any) => {
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
    return matchExpression;
};

const setupAdminLayers = (layerName: string) => {
    if (!map) return;
      
    // Removed country filter as tiles are country specific and property might be missing
    const adminFilter = ['all', 
        ['==', ['get', 'admin_level'], props.adminLevel]
    ];

    const fillColor: any = buildAdminFillColorExpression(props.statsData);
    
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
  
  // Increment ID to cancel any pending async operations from previous calls
  const myUpdateId = ++currentUpdateId.value;

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
          
          if (map.getLayer('global-boundaries-line')) {
              map.setPaintProperty('global-boundaries-fill', 'fill-opacity', 0.); 
          }

          // Clear existing to avoid ID collision and ensure category update
          clearGlobalIsoLayers();

          const getLayerName = async (isoLower: string, category: string) => {
              const cacheKey = `${isoLower}_${category.toLowerCase()}`;
              if (layerNameCache.has(cacheKey)) {
                  return layerNameCache.get(cacheKey)!;
              }
              try {
                  const url = `${TILES_BASE_URL}/${isoLower}/${isoLower}_${category.toLowerCase()}_isochrones.pmtiles`;
                  const p = new PMTiles(url);
                  const meta = await p.getMetadata() as { vector_layers?: { id: string }[] };
                  if (meta && meta.vector_layers && meta.vector_layers.length > 0) {
                      const id = meta.vector_layers[0]!.id;
                      layerNameCache.set(cacheKey, id);
                      return id;
                  }
              } catch (e) {
                  // Expected for countries/categories with no PMTiles file
                  // published (e.g. a territory with no hospital data) -
                  // not an error, falls through to the 'isochrones' guess
                  // below. console.debug so it's visible with verbose
                  // logging on but doesn't spam the console by default.
                  console.debug(`[IsochroneMap] No layer metadata for ${isoLower}/${category}, falling back to 'isochrones'`, e);
              }
              return 'isochrones'; // fallback
          };

          (async () => {
              // Check if we are still the latest update
              if (myUpdateId !== currentUpdateId.value) {
                  return;
              }

              // Phase 1: resolve every country's layer name (pure network
              // I/O, no map mutation) all in parallel. Phase 2 then adds
              // every source+layer in one synchronous burst once they've
              // ALL resolved, instead of each country popping onto the map
              // individually the instant its own fetch finishes - avoids
              // ~190 separate staggered repaints while loading.
              const results = await Promise.all(props.availableCountries!.map(async (c) => {
                  const isoLower = c.value.toLowerCase();
                  const sourceId = `global-iso-source-${isoLower}`;

                  if (map?.getSource(sourceId)) return null;

                  try {
                      const layerName = await getLayerName(isoLower, props.category);
                      return { isoLower, sourceId, layerName };
                  } catch (e) {
                      // getLayerName already swallows its own expected
                      // failures (missing files) and always resolves - if
                      // this fires, something else genuinely broke.
                      console.warn(`[IsochroneMap] Unexpected failure resolving global isochrone layer for ${isoLower}`, e);
                      return null;
                  }
              }));

              if (myUpdateId !== currentUpdateId.value) return;

              const steps = buildIsochroneColorSteps(props.category);

              for (const result of results) {
                  if (!result || map?.getSource(result.sourceId)) continue;
                  const { isoLower, sourceId, layerName } = result;
                  const layerId = `global-iso-layer-${isoLower}`;
                  const url = `${TILES_BASE_URL}/${isoLower}/${isoLower}_${props.category.toLowerCase()}_isochrones.pmtiles`;

                  map?.addSource(sourceId, {
                      type: 'vector',
                      url: `pmtiles://${url}`,
                      attribution: ''
                  });

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
              }
          })();

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
    
    // Check for Stale Update
    if (myUpdateId !== currentUpdateId.value) return;

    // Safety: If dashboard mode but NO country yet (delayed), wait.
    if (!props.country) return;

    try {
        // 1. Isochrones (Base)
        const pIso = new PMTiles(isochronesUrl);
        // ... (rest of loadSource logic)
        const headerIso = await pIso.getHeader();
        if (headerIso) {
            const isoBounds: [[number, number], [number, number]] = [
                [headerIso.minLon, headerIso.minLat],
                [headerIso.maxLon, headerIso.maxLat]
            ];

            map.fitBounds(isoBounds, { padding: 20, animate: true });
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

// Structural changes (country/category/scale/global-view toggles) need a full
// rebuild: different PMTiles sources, different layers.
watch(() => [props.country, props.category, props.adminLevel, props.showGlobalIsochrones, props.isGlobalView, props.availableCountries], () => {
  if (isViewTransitioning.value) return;
  localStats.value = (props.statsData || []) as any[];
  updateMapData();
});

// A statsData-only change (e.g. the user picked a different range) doesn't
// need a source/layer rebuild — just recolor the existing admin layer in
// place. Avoids the visible flicker/re-fetch a full updateMapData() causes.
watch(() => props.statsData, (stats) => {
  localStats.value = (stats || []) as any[];

  if (!map || props.adminLevel === 'ADM0' || !map.getLayer('admin-boundaries-fill-layer')) return;

  map.setPaintProperty('admin-boundaries-fill-layer', 'fill-color', buildAdminFillColorExpression(stats));
}, { deep: true });

// Specific watcher to zoom when country changes
// Removed hardcoded CENTERS watcher. Zoom is now handled in updateMapData via PMTiles metadata.

import { onUpdated, computed } from 'vue';

// Legend Data
const isochroneLegendItems = computed(() => getIsochroneLegendItems(props.category));

const adminLegendItems = getAdminLegendItems();

onUpdated(() => {

});
</script>

<template>
  <div ref="mapContainer" class="map-container relative">
    <!-- Cross-fades over the canvas during the global<->local pane-width
    transition. MapLibre's ResizeObserver-driven map.resize() clears the
    WebGL drawing buffer on every layout tick of that CSS transition, and
    the repaint can't keep up, producing a black flash - this masks it
    rather than chasing the underlying resize/repaint race. -->
    <div
        class="absolute inset-0 z-40 flex items-center justify-center bg-slate-100 dark:bg-slate-900 transition-opacity duration-150 ease-in-out pointer-events-none"
        :class="isViewTransitioning ? 'opacity-100' : 'opacity-0'"
    >
        <div class="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div v-if="!isGlobalView || (isGlobalView && showGlobalIsochrones)" class="legend-overlay bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-lg text-slate-900 dark:text-slate-200 text-xs transition-all duration-300" 
         :class="{ 'w-auto': isLegendExpanded, 'w-auto h-auto p-2 flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800': !isLegendExpanded }">
        
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
        <button v-else @click="isLegendExpanded = true" class="w-full h-full flex items-center gap-2 justify-center text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 focus:outline-none" title="Show Legend">
             <span class="font-bold uppercase tracking-wider text-[10px]">Legend</span>
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
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
    top: 20px;
    left: 20px;
    z-index: 10;

    min-width: 140px;
}
</style>
