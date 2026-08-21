export const TILES_BASE_URL = 'https://hot.storage.heigit.org/heigit-hdx-public/access/aux/tiles';
export const STORAGE_BASE_URL = 'https://hot.storage.heigit.org/heigit-hdx-public';
export const COUNTRIES_URL = `${STORAGE_BASE_URL}/access/aux/countries.yaml`;

export const HDX_BASE_URL = 'https://data.humdata.org/dataset';


export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Selectable range/time thresholds for the range dropdown, shared by
// DashboardView and ChartPanel so both offer the same options for the
// same selectedRange value. Verified against the actual Parquet data
// (category=education / hospitals / primary_healthcare) - these are
// exactly the range values that exist, not an arbitrary curated subset.
export const RANGE_OPTIONS: Record<'education' | 'health', { value: number; label: string }[]> = {
  education: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(km => ({ value: km * 1000, label: `${km} km` })),
  health: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map(min => ({ value: min * 60, label: `${min} min` })),
};

// Refined 10-class YlGnBu-like (Reversed: Low=Dark, High=Light)
export const ADMIN_COLORS_10 = [
    '#020b2e', // 0-10 (Darker)
    '#081d58', // 10-20
    '#253494', // 20-30
    '#225ea8', // 30-40
    '#1d91c0', // 40-50
    '#41b6c4', // 50-60
    '#7fcdbb', // 60-70
    '#c7e9b4', // 70-80
    '#edf8b1', // 80-90
    '#ffffd9'  // 90-100 (Light)
];

export const ISOCHRONE_COLORS_EDUCATION = [
    '#fde725', // Yellow
    '#b5de2b',
    '#6ece58',
    '#35b779',
    '#1f9e89',
    '#26828e',
    '#31688e',
    '#3e4989',
    '#482878',
    '#440154'  // Dark Purple
];

export const ISOCHRONE_COLORS_HEALTH = [
    '#fde725',
    '#c2df23',
    '#86d549',
    '#52c569',
    '#2ab07f',
    '#1e9b8a',
    '#25858e',
    '#2d708e',
    '#38588c',
    '#433e85',
    '#482173',
    '#440154'
];

// Builds the MapLibre 'step' fill-color expression for an isochrone layer,
// keyed on the feature's 'range' property. The single source of truth for
// isochrone step breakpoints + colors - this used to be hand-copied in
// three places in IsochroneMap.vue (each rebuild, each with its own
// hardcoded hex list and breakpoint values, free to drift from each other).
// `isHidden` makes a step transparent instead of colored, for the legend's
// click-to-toggle-visibility feature; omit it for a plain, fully-visible
// scale.
export const buildIsochroneColorSteps = (category: string, isHidden: (label: string) => boolean = () => false) => {
    const colors = category === 'education' ? ISOCHRONE_COLORS_EDUCATION : ISOCHRONE_COLORS_HEALTH;
    const ranges = category === 'education' ? RANGE_OPTIONS.education : RANGE_OPTIONS.health;
    const steps: any[] = ['step', ['to-number', ['get', 'range']]];
    steps.push(isHidden(ranges[0]!.label) ? 'rgba(0,0,0,0)' : colors[0]);
    for (let i = 1; i < ranges.length; i++) {
        steps.push(ranges[i - 1]!.value + 1);
        steps.push(isHidden(ranges[i]!.label) ? 'rgba(0,0,0,0)' : colors[i]);
    }
    return steps;
};

// Legend entries for an isochrone category, derived from the same colors +
// ranges buildIsochroneColorSteps uses, so the legend can never drift from
// what's actually painted on the map.
export const getIsochroneLegendItems = (category: string) => {
    const colors = category === 'education' ? ISOCHRONE_COLORS_EDUCATION : ISOCHRONE_COLORS_HEALTH;
    const ranges = category === 'education' ? RANGE_OPTIONS.education : RANGE_OPTIONS.health;
    return ranges.map((r, i) => ({ color: colors[i]!, label: r.label }));
};

const adminBucketLabel = (i: number) => `${i * 10} - ${i * 10 + 10}%`;

// Builds the MapLibre 'step' fill-color expression for the admin-boundary
// choropleth layer, keyed on the 'population_share' feature-state. Same
// duplication problem as the isochrone steps above - was hand-copied
// alongside a separately hand-typed legend items list.
export const buildAdminColorSteps = (isHidden: (label: string) => boolean = () => false) => {
    const steps: any[] = ['step', ['feature-state', 'population_share']];
    steps.push(isHidden(adminBucketLabel(0)) ? 'rgba(0,0,0,0)' : ADMIN_COLORS_10[0]);
    for (let i = 1; i < 10; i++) {
        steps.push(i * 10);
        steps.push(isHidden(adminBucketLabel(i)) ? 'rgba(0,0,0,0)' : ADMIN_COLORS_10[i]);
    }
    return steps;
};

// Legend entries for the admin choropleth, highest bucket first (matches
// the order the legend is displayed in) - derived from the same colors
// buildAdminColorSteps uses.
export const getAdminLegendItems = () => {
    return Array.from({ length: 10 }, (_, i) => {
        const bucket = 9 - i;
        return { color: ADMIN_COLORS_10[bucket]!, label: adminBucketLabel(bucket) };
    });
};
