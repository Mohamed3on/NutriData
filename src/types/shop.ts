import { Metrics, NutrientInfo, PriceAndWeightInfo } from '../types';

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
