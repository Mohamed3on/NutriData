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

  if (
    metrics.proteinPerCurrency &&
    metrics.proteinPer100Calories &&
    metrics.proteinPerCurrency !== 'N/A' &&
    metrics.proteinPer100Calories !== 'Infinity' &&
    metrics.proteinPer100Calories !== 'N/A'
  ) {
    const ppc = parseFloat(metrics.proteinPerCurrency); // g protein per currency
    const ppc100 = parseFloat(metrics.proteinPer100Calories); // g protein per 100 calories

    // Parse fiber and saturated fat if they exist, handling unit strings
    const fiber = nutrientInfo.fiber ? parseFloat(nutrientInfo.fiber.replace(/[^\d.-]/g, '')) : 0;
    const saturatedFat = nutrientInfo.saturatedFat
      ? parseFloat(nutrientInfo.saturatedFat.replace(/[^\d.-]/g, ''))
      : 0;

    // Create adjustment factors:
    // 1. Fiber bonus: ranges from 1 to 1.3 (up to 30% boost)
    // - Most foods have 0-4g fiber per 100g
    // - High fiber foods have 4-8g per 100g
    // - Very high fiber foods have >8g per 100g
    const fiberBonus = fiber > 0 ? 1 + Math.min(fiber / 8, 0.3) : 1;

    // 2. Saturated fat penalty: ranges from 1 to 0.5 (up to 50% reduction)
    // - Low sat fat foods have <1g per 100g
    // - Medium sat fat foods have 1-5g per 100g
    // - High sat fat foods have >5g per 100g
    const satFatPenalty = saturatedFat > 0 ? Math.max(1 - saturatedFat / 10, 0.5) : 1;

    // Calculate base score with protein metrics (weighted geometric mean)
    const baseScore = Math.pow(ppc100, 0.65) * Math.pow(ppc, 0.35);

    // Apply fiber bonus and saturated fat penalty
    metrics.nutriScore = (baseScore * fiberBonus * satFatPenalty).toFixed(1);
  } else {
    metrics.nutriScore = '0';
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
    return ((protein * 10) / pricePerKg).toFixed(1); // protein is per 100g, therefore protein * 10
  }
  if (weight && price > 0) {
    return ((protein * weight) / (100 * price)).toFixed(1); // protein is per 100g, weight in g, therefore 100g * price
  }
  return 'N/A';
}

function calculateRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return numerator > 0 ? 'Infinity' : 'N/A';
  return (numerator / denominator).toFixed(1);
}
