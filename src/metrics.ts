import { Metrics, NutrientInfo, PriceAndWeightInfo } from './types';

export function calculateMetrics(
  nutrientInfo: NutrientInfo,
  priceAndWeightInfo: PriceAndWeightInfo
): Metrics {
  // Simplified parsing and default values
  const protein = parseFloat(nutrientInfo.protein) || 0;
  const carbs = parseFloat(nutrientInfo.carbs) || 0;
  const calories = parseInt(nutrientInfo.calories.replace(/\D/g, '')) || 0;
  const { price = 0, weight = 0 } = priceAndWeightInfo;

  return {
    proteinPerEuro: calculateProteinPerEuro(protein, price, weight),
    proteinToCarbRatio: calculateRatio(protein, carbs),
    proteinPer100Calories: calories > 0 ? calculateRatio(protein, calories / 100) : 'N/A',
  };
}

function calculateProteinPerEuro(protein: number, price: number, weight: number | null): string {
  if (weight && price > 0) {
    return ((protein * weight) / (100 * price)).toFixed(1);
  }
  return 'N/A';
}

function calculateRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return numerator > 0 ? 'Inf' : 'N/A';
  return (numerator / denominator).toFixed(1);
}
