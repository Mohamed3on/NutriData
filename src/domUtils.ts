import { Metrics, NutrientInfo } from './types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from './utils';
import { globalCurrency } from './globalState';
import { createTooltipHTML, createTooltipStyles } from './ui';

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
  metricsElement.style.cssText = `
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 16px;
    margin: 16px 0;
    font-size: 12px;
    font-family: system-ui;
    color: #333;
    position: relative;
  `;

  if (!metrics || !nutrientInfo) {
    return metricsElement;
  }

  // Add data attributes for each metric and nutrient
  Object.entries(metrics).forEach(([key, value]) => {
    metricsElement.setAttribute(`data-${key}`, value);
  });
  Object.entries(nutrientInfo).forEach(([key, value]) => {
    metricsElement.setAttribute(`data-${key}`, value);
  });

  const metricOrder: (keyof Metrics)[] = [
    'proteinPerCurrency',
    'proteinPer100Calories',
    'proteinToCarbRatio',
  ];

  const nutrientOrder: (keyof NutrientInfo)[] = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'sugar',
    'fiber',
  ];

  metricsElement.innerHTML = `
    <style>
      ${createTooltipStyles()}
      .section-title {
        font-weight: bold;
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #tooltip-container {
        position: relative;
        display: inline-block;
      }
    </style>
    <div class="section-title">
      Protein Analysis
      ${createTooltipHTML()}
    </div>
    ${metricOrder
      .map(
        (key) => `
      <div>
        ${formatLabel(key, globalCurrency)}:
        <span style="font-weight: bold; color: ${getColorForValue(
          metrics[key],
          COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
        )}">
          ${metrics[key]}${
          key === 'proteinPerCurrency' && metrics[key] !== 'N/A' ? `g/${globalCurrency}` : ''
        }${key === 'proteinPer100Calories' && metrics[key] !== 'N/A' ? 'g' : ''}
        </span>
      </div>
    `
      )
      .join('')}
    <div style="border-top: 1px solid #ddd; margin: 10px 0;"></div>
    <div class="section-title">Nutrients per 100g</div>
    ${nutrientOrder
      .map((key) =>
        nutrientInfo[key]
          ? `
      <div>
        ${key.charAt(0).toUpperCase() + key.slice(1)}:
        <span style="font-weight: bold;">
          ${nutrientInfo[key]}
        </span>
      </div>
    `
          : ''
      )
      .join('')}
  `;

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
