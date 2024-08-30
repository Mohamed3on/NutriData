import { Metrics, NutrientInfo, PriceAndWeightInfo } from '../types';

export interface Shop {
  name: string;
  getCurrency: (url: string) => string;
  getNutrientInfo: (doc: Document) => Promise<NutrientInfo>;
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
