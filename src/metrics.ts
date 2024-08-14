import { Metrics, NutrientInfo, PriceAndWeightInfo } from './types';

export function calculateMetrics(
  nutrientInfo: NutrientInfo,
  priceAndWeightInfo: PriceAndWeightInfo
): Metrics {
  const proteinGramsPer100g = parseFloat(nutrientInfo.protein);
  const { price, weight, pricePerKg } = priceAndWeightInfo;
  const carbGrams = parseFloat(nutrientInfo.carbs);

  // Handle calories by keeping only numbers, removing decimal points
  const calories = parseInt(nutrientInfo.calories.replace(/[^\d]/g, ''), 10);

  let proteinPerEuro = 'N/A';
  if (weight) {
    const totalProtein = (proteinGramsPer100g * weight) / 100;
    proteinPerEuro = (totalProtein / price).toFixed(1);
  } else if (pricePerKg) {
    proteinPerEuro = ((proteinGramsPer100g * 10) / pricePerKg).toFixed(1);
  }

  const proteinToCarbRatio = (proteinGramsPer100g / carbGrams).toFixed(1);
  const proteinPer100Calories = ((proteinGramsPer100g / calories) * 100).toFixed(1);

  return { proteinPerEuro, proteinToCarbRatio, proteinPer100Calories };
}
