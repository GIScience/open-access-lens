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
