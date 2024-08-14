export interface NutrientInfo {
  protein: string;
  carbs: string;
  sugar: string;
  fat: string;
  calories: string;
}

export interface PriceAndWeightInfo {
  price: number;
  weight: number | null;
  pricePerKg: number | null;
}

export interface Metrics {
  proteinPerEuro: string;
  proteinToCarbRatio: string;
  proteinPer100Calories: string;
}

export interface ColorThresholds {
  good: number;
  bad: number;
}

export interface Shop {
  name: string;
  getNutrientInfo: (doc: Document) => NutrientInfo;
  getPriceAndWeightInfo: (doc: Document) => PriceAndWeightInfo;
  getInsertionPoint: (element: HTMLElement) => HTMLElement | null;
}

export interface CachedData {
  nutrientInfo: NutrientInfo;
  metrics: Metrics;
  timestamp: number;
}
