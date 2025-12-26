export interface StatsData {
    id: string | number;
    population: number;
    population_share: number; // 0-100
    range?: number;
    [key: string]: any;
}

export interface CountryOption {
    label: string;
    value: string;
}

export interface LegendItem {
    color: string;
    label: string;
}
