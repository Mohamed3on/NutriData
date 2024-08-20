import { Metrics, NutrientInfo } from './types';
import { globalCurrency } from './globalState';
import { MetricsCard } from './components/MetricsCard';
import { createRoot } from 'react-dom/client';
import React from 'react';

export async function fetchProductData(url: string): Promise<Document> {
  const response = await fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

export function createMetricsElement(
  metrics: Metrics | null | undefined,
  nutrientInfo: NutrientInfo | null | undefined
): HTMLElement {
  const metricsElement = document.createElement('div');
  metricsElement.className = 'nutri-data-metrics';
  metricsElement.style.display = 'grid';
  metricsElement.style.margin = '0 auto';
  metricsElement.style.width = 'max-content';

  if (metrics && nutrientInfo) {
    Object.entries(metrics).forEach(([key, value]) => {
      metricsElement.setAttribute(`data-${key}`, value);
    });
    Object.entries(nutrientInfo).forEach(([key, value]) => {
      metricsElement.setAttribute(`data-${key}`, value);
    });

    const root = createRoot(metricsElement);
    root.render(<MetricsCard metrics={metrics} nutrientInfo={nutrientInfo} />);
  }

  return metricsElement;
}

export function createCustomSortSelect(
  onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
): HTMLSelectElement {
  const customSelect = document.createElement('select');
  customSelect.className = 'Select_rsSelect__qwGEE Select_rsSelectText__U_NgU nutri-data-sort';
  customSelect.style.marginLeft = '10px';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Sort by Nutrient Metrics';
  customSelect.appendChild(defaultOption);

  const metricOptions: [keyof Metrics | keyof NutrientInfo, string, boolean][] = [
    ['proteinPerCurrency', `Protein per ${globalCurrency} (High to Low)`, false],
    ['proteinPer100Calories', 'Protein per 100 Calories (High to Low)', false],
    ['proteinToCarbRatio', 'Protein to Carb Ratio (High to Low)', false],
    ['protein', 'Protein (High to Low)', false],
    ['carbs', 'Carbs (High to Low)', false],
    ['fat', 'Fat (High to Low)', false],
    ['fiber', 'Fiber (High to Low)', false],
    ['calories', 'Calories (Low to High)', true],
    ['sugar', 'Sugar (Low to High)', true],
  ];

  metricOptions.forEach(([metric, label, ascending]) => {
    const option = document.createElement('option');
    option.value = `${metric},${ascending}`;
    option.textContent = label;
    customSelect.appendChild(option);
  });

  customSelect.addEventListener('change', (event) => {
    const [metric, ascending] = (event.target as HTMLSelectElement).value.split(',');
    if (metric) {
      onSort(metric as keyof Metrics | keyof NutrientInfo, ascending === 'true');
    }
  });

  return customSelect;
}
