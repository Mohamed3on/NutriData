import { NutrientInfo, PriceAndWeightInfo, Shop } from '../types';

const NUTRIENT_LABELS: Record<keyof NutrientInfo, string> = {
  protein: 'Protein',
  carbs: 'Carbohydrate',
  sugar: '- Sugars',
  fat: 'Fat',
  calories: 'Energy (kcal)',
  fiber: 'Fibre',
};

export const amazonShop: Shop = {
  name: 'amazon',
  getNutrientInfo(doc: Document): NutrientInfo {
    const table = doc.querySelector('#productDetails_techSpec_section_2');
    const nutrientInfo: Partial<NutrientInfo> = {};

    table?.querySelectorAll('tr').forEach((row) => {
      const labelCell = row.querySelector('th');
      const valueCell = row.querySelector('td');
      if (labelCell && valueCell) {
        const label = labelCell.textContent?.trim();
        const value = valueCell.textContent?.trim().replace('‎', '').split(' ')[0];
        const nutrientKey = Object.keys(NUTRIENT_LABELS).find(
          (key) => NUTRIENT_LABELS[key as keyof NutrientInfo] === label
        ) as keyof NutrientInfo | undefined;

        if (nutrientKey && value) {
          nutrientInfo[nutrientKey] = value;
        }
      }
    });

    return nutrientInfo as NutrientInfo;
  },

  getPriceAndWeightInfo(doc: Document): PriceAndWeightInfo {
    const pricePerKgElement = doc.querySelector('.a-price.a-text-price[data-a-size="mini"]');
    const pricePerKgText = pricePerKgElement?.querySelector('.a-offscreen')?.textContent || '';
    const pricePerKgMatch = pricePerKgText.match(/€([\d,.]+)/);
    const pricePerKg = pricePerKgMatch ? parseFloat(pricePerKgMatch[1].replace(',', '.')) : null;

    return { pricePerKg };
  },

  getInsertionPoint(element: HTMLElement): HTMLElement | null {
    return element.querySelector('#desktop_almBuyBox');
  },
};
