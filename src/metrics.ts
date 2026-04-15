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
    const ppc = parseFloat(metrics.proteinPerCurrency);
    const ppc100 = parseFloat(metrics.proteinPer100Calories);

    const fiber = nutrientInfo.fiber ? parseFloat(nutrientInfo.fiber.replace(/[^\d.-]/g, '')) : 0;
    const satFat = nutrientInfo.saturatedFat
      ? parseFloat(nutrientInfo.saturatedFat.replace(/[^\d.-]/g, ''))
      : 0;

    // Fiber bonus caps at +15% (8g/100g → "very high fiber" threshold).
    const fiberBonus = fiber > 0 ? 1 + Math.min(fiber / 8, 0.15) : 1;
    // Saturated fat penalty: 1% per g/100g, floored at -50% so butter (~51g) hits the floor.
    const satFatPenalty = satFat > 0 ? 1 - Math.min(satFat / 100, 0.5) : 1;

    // Weighted geometric mean favoring protein-per-calorie over protein-per-currency.
    const baseScore = Math.pow(ppc100, 0.65) * Math.pow(ppc, 0.35);
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
