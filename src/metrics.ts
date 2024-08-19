import { Metrics, NutrientInfo, PriceAndWeightInfo } from './types';

export function calculateMetrics(
  nutrientInfo: NutrientInfo,
  priceAndWeightInfo: PriceAndWeightInfo
): Metrics {
  // Simplified parsing and default values
  const protein = parseFloat(nutrientInfo.protein) || 0;
  const carbs = parseFloat(nutrientInfo.carbs) || 0;
  const calories = nutrientInfo.calories
    ? parseInt(nutrientInfo.calories.replace(/\D/g, ''))
    : null;
  const { pricePerKg = null, weight = null, price = 0 } = priceAndWeightInfo;

  const metrics: Partial<Metrics> = {
    proteinPerEuro: calculateProteinPerEuro(protein, price, weight, pricePerKg),
    proteinToCarbRatio: calculateRatio(protein, carbs),
  };

  // Only include proteinPer100Calories if calorie data is available
  if (calories !== null && calories > 0) {
    metrics.proteinPer100Calories = calculateRatio(protein, calories / 100);
  }

  return metrics as Metrics;
}

function calculateProteinPerEuro(
  protein: number,
  price: number,
  weight: number | null,
  pricePerKg: number | null
): string {
  if (weight && price > 0) {
    return ((protein * weight) / (100 * price)).toFixed(1);
  }
  return pricePerKg ? ((protein * 10) / pricePerKg).toFixed(1) : 'N/A';
}

function calculateRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return numerator > 0 ? 'Infinity' : 'N/A';
  return (numerator / denominator).toFixed(1);
}
