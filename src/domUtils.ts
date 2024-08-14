import { Metrics } from './types';
import { COLOR_THRESHOLDS, getColorForValue } from './utils';

export async function fetchProductData(url: string): Promise<Document> {
  const response = await fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

export function createMetricsElement(metrics: Metrics): HTMLElement {
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

  const labelMap: Record<keyof Metrics, string> = {
    proteinPerEuro: 'Protein g per €',
    proteinToCarbRatio: 'Protein to Carb Ratio',
    proteinPer100Calories: 'Protein g per 100 calories',
  };

  // Define the order of metrics
  const metricOrder: (keyof Metrics)[] = [
    'proteinPerEuro',
    'proteinToCarbRatio',
    'proteinPer100Calories',
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
