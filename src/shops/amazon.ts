import { setGlobalCurrency } from '../globalState';
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
    let pricePerKg: number | null = null;
    let detectedCurrency: '€' | '£' | null = null;

    // Try to find the pricePerUnit element first
    const pricePerUnitElement = doc.querySelector('.pricePerUnit');
    // If not found, look for the alternative element
    const alternativeElement =
      pricePerUnitElement ||
      doc.querySelector('.a-size-mini.a-color-base.aok-align-center.a-text-normal');

    if (alternativeElement) {
      const pricePerUnitText = alternativeElement.textContent?.trim() || '';
      const match = pricePerUnitText.match(/([£€])([\d,.]+)\s*\/\s*([\d,.]+)?\s*([a-zA-Z]+)/);

      if (match) {
        const [, currency, value, amount, unit] = match;
        detectedCurrency = currency as '€' | '£';
        const price = parseFloat(value.replace(',', '.'));
        const quantity = amount ? parseFloat(amount.replace(',', '.')) : 1;

        if (
          unit.toLowerCase() === 'g' ||
          unit.toLowerCase() === 'gram' ||
          unit.toLowerCase() === 'grams'
        ) {
          pricePerKg = (price / quantity) * 1000;
        } else if (
          unit.toLowerCase() === 'kg' ||
          unit.toLowerCase() === 'kilo' ||
          unit.toLowerCase() === 'kilos'
        ) {
          pricePerKg = price / quantity;
        }
      }
    }

    if (detectedCurrency) {
      setGlobalCurrency(detectedCurrency);
    }

    return { pricePerKg };
  },

  getInsertionPoint(element: HTMLElement): HTMLElement | null {
    return element.querySelector('#imageBlock');
  },
};
