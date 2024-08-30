import { Metrics, NutrientInfo, PriceAndWeightInfo } from './types';

export function calculateMetrics(
  nutrientInfo: NutrientInfo,
  priceAndWeightInfo: PriceAndWeightInfo
): Metrics {
  const metrics: Partial<Metrics> = {};

  const protein = parseFloat(nutrientInfo.protein);

  if (isNaN(protein)) return metrics as Metrics;

  const carbs = parseFloat(nutrientInfo.carbs);
  const calories = nutrientInfo.calories
    ? parseFloat(nutrientInfo.calories.replace(/,/g, ''))
    : null;
  const { pricePerKg = null, weight = null, price = 0 } = priceAndWeightInfo;

  if (pricePerKg || (price > 0 && weight)) {
    metrics.proteinPerCurrency = calculateProteinPerCurrency(protein, price, weight, pricePerKg);
  }

  if (!isNaN(carbs)) {
    metrics.proteinToCarbRatio = calculateRatio(protein, carbs);
  }

  if (calories !== null && calories > 0) {
    metrics.proteinPer100Calories = calculateRatio(protein, calories / 100);
  }

  return metrics as Metrics;
}

function calculateProteinPerCurrency(
  protein: number,
  price: number,
  weight: number | null,
  pricePerKg: number | null
): string {
  if (pricePerKg) {
    return ((protein * 10) / pricePerKg).toFixed(1);
  }
  if (weight && price > 0) {
    return ((protein * weight) / (100 * price)).toFixed(1);
  }
  return 'N/A';
}

function calculateRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return numerator > 0 ? 'Infinity' : 'N/A';
  return (numerator / denominator).toFixed(1);
}
