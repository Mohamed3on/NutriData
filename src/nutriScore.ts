// Protein-forward NutriScore — the single source of truth for the ranking
// number, shared by the extension (metrics.ts) and the protein-index site
// generator (scripts/build-protein-site.ts) so both rank on the same scale.
//
// A weighted geometric mean favouring protein-per-100-kcal over protein-per-€,
// lifted by fiber (capped +15%) and dragged down by saturated fat (floored
// −50%). Inputs are per-100g numbers; callers handle missing data / formatting.
export function computeNutriScore(
  proteinPer100Kcal: number,
  proteinPerEuro: number,
  fiber: number | null | undefined,
  satFat: number | null | undefined
): number {
  const fiberBonus = fiber && fiber > 0 ? 1 + Math.min(fiber / 8, 0.15) : 1;
  const satFatPenalty = satFat && satFat > 0 ? 1 - Math.min(satFat / 100, 0.5) : 1;
  return Math.pow(proteinPer100Kcal, 0.65) * Math.pow(proteinPerEuro, 0.35) * fiberBonus * satFatPenalty;
}
