// A REWE product, from its D1 row to the scored card the site renders. Shared by
// the site build (the full snapshot in rewe.json) and the page itself: the build
// bundles this into the page, which folds in the rows the extension updated
// after the snapshot was built (the Worker's /changes), so a collected price
// shows up on the next page load instead of the next deploy.
import { computeNutriScore, fiberFromEnergy, LOW_SCORE } from '../../src/nutriScore';

// "3.9 g" → 3.9 ; "\N" / "" / null → null
export function num(s: string | null | undefined): number | null {
  if (!s || s === '\\N') return null;
  const m = String(s).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// energy string → kcal (converts when the value is declared in kJ)
export function kcal(s: string | null | undefined): number | null {
  if (!s || s === '\\N') return null;
  const v = num(s);
  if (v === null) return null;
  return /kj/i.test(String(s)) && !/kcal/i.test(String(s)) ? Math.round(v / 4.184) : v;
}

// REWE nutrition object → compact per-100g array, in the canonical slot order
// used across the extension and site: [protein, carbs, sugar, fat, calories,
// fiber, salt, satFat].
export function toNutriArray(n: Record<string, string>): (number | null)[] {
  return [num(n.protein), num(n.carbs), num(n.sugar), num(n.fat), kcal(n.calories), num(n.fiber), num(n.salt), num(n.saturatedFat)];
}

export type ReweProduct = {
  id: string; name: string; url: string; img: string; cats: string[];
  price: number | null; ppu: number | null; unit: string | null;
  brand: string | null; gtin: string | null;
  nutri: (number | null)[]; // [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
  updated?: string; // D1 updated_at, 'YYYY-MM-DD HH:MM:SS' UTC
};

// /collect takes anyone's writes and the page renders them live, so links and
// images must point at REWE over https (no javascript: or other hosts).
const reweUrl = (u: unknown, host: RegExp) =>
  typeof u === 'string' && host.test(u) ? u : '';

// A D1 `product` row → ReweProduct, or null when it has no protein and no calories.
export function rowToProduct(row: Record<string, any>): ReweProduct | null {
  let n: Record<string, string> = {};
  if (row.nutritional_data) { try { n = JSON.parse(row.nutritional_data); } catch {} }
  const nutri = toNutriArray(n);
  if (nutri[0] === null && nutri[4] === null) return null;
  let cats: string[] = [];
  if (row.categories) { try { cats = JSON.parse(row.categories); } catch {} }
  return {
    // Some seeded urls read shop.rewe.de/shop/p/…, which REWE redirects to a
    // /shop/shop/p/ path the extension doesn't run on — so it never saw them 404.
    id: row.shop_id, name: row.name || '',
    url: reweUrl(row.url, /^https:\/\/(shop|www)\.rewe\.de\//).replace('rewe.de/shop/p/', 'rewe.de/p/'),
    img: reweUrl(row.image_url, /^https:\/\/img\.rewe-static\.de\//),
    cats, price: row.price, ppu: row.price_per_unit, unit: row.unit, brand: row.brand, gtin: row.gtin, nutri,
    updated: row.updated_at,
  };
}

export type Card = Record<string, unknown> & { id: string };

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
export const round = (n: number | null | undefined, digits = 1): number | undefined =>
  n == null || !isFinite(n) ? undefined : +n.toFixed(digits);

// Reject physically-impossible per-100g rows (bad source data). The killer
// case is near-zero calories with real macros: protein-per-100-kcal then
// explodes and the row rockets to the top of the ranking. Mirrors the
// Atwater sanity gate the Mercadona OCR pipeline used.
function isSane(
  protein: number, carbs: number | null, fat: number | null, calories: number
): boolean {
  if (protein < 0 || protein > 100) return false;
  if (!(calories > 0) || calories > 950) return false;
  if (fat != null && (fat < 0 || fat > 100)) return false;
  if (carbs != null && (carbs < 0 || carbs > 105)) return false;
  // Protein is 4 kcal/g, so 100 kcal can hold at most 25 g protein. A higher
  // protein-per-100-kcal is physically impossible → bad calorie value. This is
  // the value the ranking falls back to, so a bogus one rockets to the top.
  if ((protein * 100) / calories > 27) return false;
  const est = 4 * protein + 4 * (carbs || 0) + 9 * (fat || 0); // kcal implied by macros
  if (est > calories * 2 + 10) return false;   // stated kcal implausibly low vs macros
  if (calories > est * 3 + 100) return false;   // stated kcal implausibly high (e.g. kJ mislabel)
  return true;
}

// The card for one product, or why it has none.
export function reweCard(p: ReweProduct): Card | 'no-nutrition' | 'insane' {
  const [protein, carbs, sugar, fat, calories, fiber, salt, satFat] = p.nutri;
  if (protein == null || calories == null || calories <= 0) return 'no-nutrition';
  if (!isSane(protein, carbs, fat, calories)) return 'insane';

  const ppc100 = protein / (calories / 100);
  // price_per_unit is REWE's Grundpreis in €/kg (or €/L) — same role as
  // Mercadona's reference price. protein is per 100g → *10 = per kg.
  const ppu = p.ppu;
  const name = p.name || '';
  // REWE quotes the Grundpreis of a drink concentrate per litre of *prepared*
  // product — a €1.49 tin of bouillon powder shows €0.21/l because it yields
  // 7l — while `nutri` describes 100g of the powder in the tin. Reading the two
  // together valued Knorr stock at ~900g of protein per euro and handed it the
  // top four places of the index. The tell is a volume reference whose implied
  // pack size is bigger than any real container, combined with dry-goods energy
  // density: a genuine ready-to-drink liquid sold by the litre is nowhere near
  // 150 kcal/100ml. Such a Grundpreis says nothing about protein per euro, so
  // drop the price term and let the item rank unscored rather than first.
  const isVolumeRef = /\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|liter|litre)\b/i.test(name);
  const impliedPack = ppu && ppu > 0 && p.price ? p.price / ppu : null;
  const isConcentrate =
    isVolumeRef && impliedPack != null && impliedPack >= 3 && calories >= 150;
  const ppc = ppu && ppu > 0 && !isConcentrate ? (protein * 10) / ppu : null;

  const nutriScore = ppc != null && isFinite(ppc100)
    ? computeNutriScore(ppc100, ppc, fiber ?? fiberFromEnergy(protein, carbs, fat, calories), satFat, sugar)
    : null;

  // REWE categories are a 3-4 level path (dept > … > leaf). Keep every level:
  // the site's category filter is a tree, so mid-levels like "Eiscreme &
  // Eiswürfel" stay selectable instead of being collapsed away to the leaf.
  const cats = p.cats.filter(Boolean);
  const searchText = norm(`${name} ${p.brand || ''} ${cats.join(' ')}`);

  // undefined-valued keys are dropped by JSON.stringify, so a flat literal
  // gives the same output as conditional spreads without the double round().
  return {
    id: p.id, n: name, u: p.url,
    img: p.img || undefined,
    cs: cats,
    q: searchText, sn: norm(name),
    ns: round(nutriScore, 3), pe: round(ppc, 3),
    pk: round(ppc100, 3) || 0,
    p: round(protein, 1) || 0,
    cal: round(calories, 1) || 0,
    pr: round(p.price, 2), kg: round(ppu, 2),
    // REWE Grundpreis is €/L for liquids; detect from a volume measure in the
    // name so the card shows €x/L instead of the €x/kg fallback.
    rf: isVolumeRef ? 'L' : undefined,
    cb: round(carbs, 1), su: round(sugar, 1), ft: round(fat, 1),
    sf: round(satFat, 1), fi: round(fiber, 1), sa: round(salt, 1),
  };
}

// The default 'score' order: NutriScore desc, no-score items last, tie-broken by
// protein-per-100kcal. Scores under LOW_SCORE are noise (every butter is
// 0.0–0.2), so those rank by €/kg, cheapest first — the same rule as the
// extension's on-page sort.
export const byScore = (a: Card, b: Card) => {
  const sa = typeof a.ns === 'number' ? a.ns : -Infinity;
  const sb = typeof b.ns === 'number' ? b.ns : -Infinity;
  if (sa > -Infinity && sb > -Infinity && sa < LOW_SCORE && sb < LOW_SCORE)
    return ((a.kg as number) ?? Infinity) - ((b.kg as number) ?? Infinity) || 0;
  if (sa !== sb) return sb - sa;
  return (typeof b.pk === 'number' ? b.pk : -Infinity) - (typeof a.pk === 'number' ? a.pk : -Infinity);
};
