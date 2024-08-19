import { Metrics, NutrientInfo } from './types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from './utils';
import { globalCurrency } from './globalState';

export function createInfoElement(nutrientInfo: NutrientInfo, metrics: Metrics): HTMLElement {
  const infoElement = document.createElement('div');
  infoElement.className = 'nutri-data-info';
  infoElement.innerHTML = `
    <style>
      .nutri-data-info {
        background-color: #f8f8f8;
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 16px;
        margin: 16px auto;
        width: max-content;
      }
      .nutri-data-info p {
        margin: 5px 0;
      }
      .nutri-data-info .value {
        font-weight: bold;
      }
      .nutri-data-info .divider {
        border-top: 1px solid #ddd;
        margin: 10px 0;
      }
      .nutri-data-info .section-title {
        font-weight: bold;
        margin-bottom: 5px;
      }
    </style>
    <div class="section-title">Protein Content Analysis</div>
    ${Object.entries(metrics)
      .map(
        ([key, value]) => `
      <p>${formatLabel(key, globalCurrency)}:
        <span class="value" style="color: ${getColorForValue(
          value,
          COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
        )}">
          ${value}${key === 'proteinPerCurrency' && value !== 'N/A' ? `g/${globalCurrency}` : ''}${
          key === 'proteinPer100Calories' && value !== 'N/A' ? 'g' : ''
        }
        </span>
      </p>
    `
      )
      .join('')}
    <div class="divider"></div>
    <div class="section-title">Nutrients per 100g</div>
    ${Object.entries(nutrientInfo)
      .map(
        ([key, value]) => `
      <p>${key.charAt(0).toUpperCase() + key.slice(1)}: <span class="value">${value}</span></p>
    `
      )
      .join('')}
  `;
  return infoElement;
}
