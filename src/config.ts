export const TILES_BASE_URL = 'https://warm.storage.heigit.org/heigit-hdx-public/access/aux/tiles';
export const STORAGE_BASE_URL = 'https://warm.storage.heigit.org/heigit-hdx-public';
export const COUNTRIES_URL = `${STORAGE_BASE_URL}/access/aux/countries.yaml`;

export const HDX_BASE_URL = 'https://data.humdata.org/dataset';

export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

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

// Helper to generate fill-color steps for MapLibre
export const getIsochroneSteps = (category: string, isHidden: (label: string) => boolean) => {
    let steps: any[] = ['step', ['to-number', ['get', 'range']]];

    if (category === 'education') {
        const labels = ['5 km', '10 km', '15 km', '20 km', '25 km', '30 km', '35 km', '40 km', '45 km', '50 km'];
        const values = [5001, 10001, 15001, 20001, 25001, 30001, 35001, 40001, 45001];

        steps.push(isHidden(labels[0]!) ? 'rgba(0,0,0,0)' : ISOCHRONE_COLORS_EDUCATION[0]);
        for (let i = 0; i < values.length; i++) {
            steps.push(values[i]);
            steps.push(isHidden(labels[i + 1]!) ? 'rgba(0,0,0,0)' : ISOCHRONE_COLORS_EDUCATION[i + 1]);
        }
    } else {
        // Health logic simplified for now - manual steps used in MapCanvas
    }
    return steps;
};
