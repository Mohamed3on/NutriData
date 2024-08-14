import { Metrics } from './types';
import { COLOR_THRESHOLDS, getColorForValue } from './utils';

export async function fetchProductData(url: string): Promise<Document> {
  const response = await fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

export function createMetricsElement(metrics: Metrics | null | undefined): HTMLElement {
  const metricsElement = document.createElement('div');
  metricsElement.className = 'nutri-data-metrics';
  metricsElement.style.cssText = `
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 5px;
    margin: 8px 0;
    font-size: 12px;
    font-family: system-ui;
    color: #333;
  `;

  // Check if metrics is null or undefined
  if (!metrics) {
    return metricsElement;
  }

  // Add data attributes for each metric
  Object.entries(metrics).forEach(([key, value]) => {
    metricsElement.setAttribute(`data-${key}`, value);
  });

  const labelMap: Record<keyof Metrics, string> = {
    proteinPerEuro: 'Protein per €',
    proteinToCarbRatio: 'Protein to Carb Ratio',
    proteinPer100Calories: 'Protein per 100 calories',
  };

  const metricOrder: (keyof Metrics)[] = [
    'proteinPerEuro',
    'proteinPer100Calories',
    'proteinToCarbRatio',
  ];

  metricsElement.innerHTML = metricOrder
    .map(
      (key) => `
    <div>
      ${labelMap[key]}:
      <span style="font-weight: bold; color: ${getColorForValue(
        metrics[key],
        COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
      )}">
        ${metrics[key]}${key === 'proteinPerEuro' && metrics[key] !== 'N/A' ? 'g' : ''}${
        key === 'proteinPer100Calories' && metrics[key] !== 'N/A' ? 'g' : ''
      }
      </span>
    </div>
  `
    )
    .join('');

  return metricsElement;
}

export function createCustomSortSelect(onSort: (metric: keyof Metrics) => void): HTMLSelectElement {
  const customSelect = document.createElement('select');
  customSelect.className = 'Select_rsSelect__qwGEE Select_rsSelectText__U_NgU nutri-data-sort';
  customSelect.style.marginLeft = '10px';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Sort by Nutrient Metrics';
  customSelect.appendChild(defaultOption);

  const metricOptions: [keyof Metrics, string][] = [
    ['proteinPerEuro', 'Protein per Euro'],
    ['proteinToCarbRatio', 'Protein to Carb Ratio'],
    ['proteinPer100Calories', 'Protein per 100 Calories'],
  ];

  metricOptions.forEach(([metric, label]) => {
    const option = document.createElement('option');
    option.value = metric;
    option.textContent = label;
    customSelect.appendChild(option);
  });

  customSelect.addEventListener('change', (event) => {
    const selectedValue = (event.target as HTMLSelectElement).value as keyof Metrics;
    if (selectedValue) {
      onSort(selectedValue);
    }
  });

  return customSelect;
}
