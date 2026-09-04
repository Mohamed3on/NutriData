// Protein-forward NutriScore — the single source of truth for the ranking
// number, shared by the extension (metrics.ts) and the protein-index site
// generator (scripts/build-protein-site.ts) so both rank on the same scale.
//
// A weighted geometric mean favouring protein-per-100-kcal over protein-per-€,
// lifted by fiber (capped +15%) and dragged down by saturated fat (floored
// −50%) and sugar (floored −40%). Inputs are per-100g numbers; callers handle
// missing data / formatting.
//
// Sugar needs its own term rather than riding on the calorie denominator: at
// 4 kcal/g it is *less* calorie-dense than fat at 9, so swapping fat for sugar
// used to raise the score. The first 5 g/100g are free so that dairy lactose
// and whole fruit aren't punished for sugar nobody added.
export function computeNutriScore(
  proteinPer100Kcal: number,
  proteinPerEuro: number,
  fiber: number | null | undefined,
  satFat: number | null | undefined,
  sugar?: number | null
): number {
  const fiberBonus = fiber && fiber > 0 ? 1 + Math.min(fiber / 8, 0.15) : 1;
  const satFatPenalty = satFat && satFat > 0 ? 1 - Math.min(satFat / 100, 0.5) : 1;
  const sugarPenalty = sugar && sugar > 5 ? 1 - Math.min((sugar - 5) / 90, 0.4) : 1;
  return (
    Math.pow(proteinPer100Kcal, 0.65) *
    Math.pow(proteinPerEuro, 0.35) *
    fiberBonus *
    satFatPenalty *
    sugarPenalty
  );
}
