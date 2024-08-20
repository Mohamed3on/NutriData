import { Metrics, NutrientInfo } from './types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from './utils';
import { globalCurrency } from './globalState';

export function createTooltipHTML(): string {
  return `
    <div id="tooltip-container">
      <span class="tooltip-icon">ⓘ</span>
      <span class="tooltip-text">Data sourced directly from the product page. NutriData not responsible for any missing or inaccurate information.</span>
    </div>
  `;
}

export function createTooltipStyles(): string {
  return `
    .tooltip-icon {
      cursor: pointer;
      color: #888;
      font-size: 14px;
    }
    .tooltip-text {
      visibility: hidden;
      width: 200px;
      background-color: #333;
      color: #fff;
      text-align: center;
      border-radius: 6px;
      padding: 8px;
      position: absolute;
      z-index: 1;
      top: 125%;
      left: 50%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 12px;
    }
    #tooltip-container:hover .tooltip-text {
      visibility: visible;
      opacity: 1;
    }
  `;
}

export function createTooltip(): string {
  return `
    <style>
      ${createTooltipStyles()}
    </style>
    ${createTooltipHTML()}
  `;
}

export function createInfoElement(nutrientInfo: NutrientInfo, metrics: Metrics): HTMLElement {
  const infoElement = document.createElement('div');
  infoElement.className = 'nutri-data-info';
  infoElement.innerHTML = `
    <style>
      ${createTooltipStyles()}
      .nutri-data-info {
        background-color: #f8f8f8;
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 16px;
        margin: 16px auto;
        width: max-content;
        position: relative;
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
