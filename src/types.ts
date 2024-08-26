export interface NutrientInfo {
  protein: string;
  carbs: string;
  sugar: string;
  fat: string;
  calories: string;
  fiber?: string;
}

export interface PriceAndWeightInfo {
  price?: number;
  weight?: number | null;
  pricePerKg?: number | null;
}

export interface Metrics {
  proteinPerCurrency: string;
  proteinToCarbRatio: string;
  proteinPer100Calories: string;
}

export interface ColorThresholds {
  good: number;
  bad: number;
}

export interface Shop {
  name: string;
  currency: '€' | '£';
  getNutrientInfo: (doc: Document) => NutrientInfo;
  getPriceAndWeightInfo: (doc: Document) => PriceAndWeightInfo;
  getInsertionPoint: (element: HTMLElement) => HTMLElement | null;
  insertMetricsIntoCard: (card: Element, metricsElement: HTMLElement) => void;
  selectors: {
    productList: string;
    productCard: string;
    adElement: string;
    sortSelect: string;
    productLink: string;
  };
  createCustomSortSelect: (
    onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
  ) => HTMLSelectElement;
}

export interface CachedData {
  nutrientInfo: NutrientInfo | null;
  metrics: Metrics | null;
  timestamp: number;
}