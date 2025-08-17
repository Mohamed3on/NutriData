import { Metrics, NutrientInfo, PriceAndWeightInfo, Shop } from '../../types';

import React from 'react';

const NUTRIENT_LABELS: Partial<Record<keyof NutrientInfo, string>> = {
  protein: 'Protein',
  carbs: 'Carbohydrate',
  sugar: '- Sugars',
  fat: 'Fat',
  calories: 'Energy (kcal)',
  fiber: 'Fibre',
};

export const amazonShop: Shop = {
  name: 'amazon',
  getCurrency(url?: string): '€' | '£' {
    return url?.includes('amazon.de') ? '€' : '£';
  },
  async getNutrientInfo(doc: Document): Promise<NutrientInfo> {
    const table = doc.querySelector('#productDetails_techSpec_section_2');
    const nutrientInfo: Partial<NutrientInfo> = {};

    table?.querySelectorAll('tr').forEach((row) => {
      const labelCell = row.querySelector('th');
      const valueCell = row.querySelector('td');
      if (labelCell && valueCell) {
        const label = labelCell.textContent?.trim();
        let value = valueCell.textContent?.trim().replace('‎', '');

        const nutrientKey = Object.keys(NUTRIENT_LABELS).find(
          (key) => NUTRIENT_LABELS[key as keyof NutrientInfo] === label
        ) as keyof NutrientInfo | undefined;

        if (nutrientKey && value) {
          // Extract numeric value and unit, including cases with '<'
          const match = value.match(/^<?(?:\s*)(\d+(?:[,.]\d+)?)\s*(g|kcal)?/i);
          if (match) {
            let [, numericValue, unit] = match;
            numericValue = numericValue.replace(',', '.');

            // Preserve the unit if it exists
            const displayValue = unit ? `${numericValue} ${unit}` : numericValue;

            nutrientInfo[nutrientKey] = displayValue;
          }
        }
      }
    });

    return Promise.resolve(nutrientInfo as NutrientInfo);
  },

  async getPriceAndWeightInfo(doc: Document): Promise<PriceAndWeightInfo> {
    let pricePerKg: number | null = null;

    // Try to find the pricePerUnit element first
    const pricePerUnitElement = doc.querySelector('.pricePerUnit');
    // If not found, look for the alternative element
    const alternativeElement =
      pricePerUnitElement ||
      doc.querySelector('.a-size-mini.a-color-base.aok-align-center.a-text-normal');

    if (alternativeElement) {
      const pricePerUnitText = alternativeElement.textContent?.trim() || '';
      const match = pricePerUnitText.match(/([\d,.]+)\s*\/\s*([\d,.]+)?\s*([a-zA-Z]+)/);

      if (match) {
        const [, value, amount, unit] = match;
        const price = parseFloat(value.replace(',', '.'));
        const quantity = amount ? parseFloat(amount.replace(',', '.')) : 1;
        const unitLower = unit.toLowerCase();

        const conversionFactor = ['g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters'].includes(
          unitLower
        )
          ? 1000
          : ['kg', 'kilo', 'kilos', 'l', 'liter', 'liters'].includes(unitLower)
          ? 1
          : 0;

        if (conversionFactor) {
          pricePerKg = (price / quantity) * conversionFactor;
        }
      }
    }

    return { pricePerKg };
  },

  getPriceAndWeightInfoFromCard(_card: Element): PriceAndWeightInfo | null {
    return null;
  },

  getInsertionPoint(element: HTMLElement): HTMLElement | null {
    return element.querySelector('#imageBlock');
  },
  getMetricsCardExtraStyle(): string {
    return 'margin: 0 auto;';
  },

  insertMetricsIntoCard(card: Element, metricsElement: HTMLElement): void {
    const priceElement = card.querySelector('.a-price');
    if (priceElement && priceElement.parentNode) {
      priceElement.parentNode.insertBefore(metricsElement, priceElement.nextSibling);
    } else {
      // Fallback: append to the card if we can't find the price element
      card.appendChild(metricsElement);
    }
  },

  insertSortSelect(_sortSelectElement: HTMLElement, _container: HTMLElement): void {
    // Disable custom sort UI on Amazon
    // no-op
  },

  createCustomSortSelect(
    _onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
  ): React.ReactElement {
    // Return an empty element for Amazon (sorting disabled)
    return React.createElement(React.Fragment);
  },

  selectors: {
    productLink:
      'a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal',
    productList: '.s-result-list.s-search-results',
    productCard: '[data-asin]:not([data-asin=""])[data-index]',
    adElement: '.AdHolder',
    sortSelect: 'label[for="s-result-sort-select"]',
  },
};
