// Mercadona's price fields decoded in one place, shared by the extension
// (shops/mercadona.ts) and the card generator (scripts/patch-mercadona-media.ts)
// so the site and the live overlay can't drift apart on what a price means.
//
// `reference_price` is a €/kg (or €/L) figure only when `reference_format` says
// so: for 'unit' it prices a single capsule and for '100 g' it is ten times too
// small. Reading either as €/kg inflated protein-per-€ enormously — coffee pods
// took most of the Mercadona top ten and gelatine sheets sat at #1 on a 10x
// error. `price / unit_size` is self-consistent instead, and reproduces
// reference_price exactly for the formats that already mean €/kg.
export type MercadonaPriceFields = {
  price: number | null | undefined;
  unitSize: number | null | undefined;
  sizeFormat: string | null | undefined;
  referenceFormat: string | null | undefined;
  referencePrice: number | null | undefined;
  name: string;
};

// Grams of *edible* egg per piece: the EU grade midpoint less ~11% shell.
// Mercadona sells eggs by the dozen, so `unit_size` is a piece count and no
// mass appears anywhere in the record — but EU marketing standards (Reg. (EC)
// No 589/2008) grade hen eggs by weight and Mercadona states the grade right in
// the name, so count x grade recovers the pack mass to within a few percent.
// Matched in order: 'super grandes XL' also contains 'grandes'.
const EGG_GRAMS: [RegExp, number][] = [
  [/codorniz|quail/i, 10], // quail, ~11g gross
  [/\bXL\b|super grandes/i, 67], // XL, >=73g gross
  [/\bL\b|grandes/i, 60], // L, 63-73g gross
  [/\bM\b|medianos/i, 52], // M, 53-63g gross
  [/cocidos|boiled/i, 55], // sold peeled, so already an edible weight
];
const UNGRADED_EGG_GRAMS = 54; // ungraded packs sit between M and L

// `unit_size` is a mass only when `size_format` says kg/l — 'ud' counts pieces,
// and 18 quail eggs are not 18 kg. Eggs are the one piece-counted thing worth
// recovering, being among the cheapest protein in the shop; anything else
// piece-counted has no derivable weight and is better left unpriced than
// guessed at.
export function mercadonaPackageMassKg(f: MercadonaPriceFields): number | null {
  const sizeFormat = (f.sizeFormat ?? '').toLowerCase();
  if (sizeFormat === 'kg' || sizeFormat === 'l') return f.unitSize || null;
  const count = f.unitSize;
  if (!count || count <= 0 || !/huevo|egg/i.test(f.name)) return null;
  const grams = EGG_GRAMS.find(([re]) => re.test(f.name))?.[1] ?? UNGRADED_EGG_GRAMS;
  return (count * grams) / 1000;
}

export function mercadonaPricePerKg(f: MercadonaPriceFields): number | null {
  const mass = mercadonaPackageMassKg(f);
  if (f.price && f.price > 0 && mass && mass > 0) return f.price / mass;
  const rf = f.referenceFormat;
  if (f.referencePrice && f.referencePrice > 0 && (rf === 'kg' || rf === 'L')) {
    return f.referencePrice;
  }
  return null;
}

// The label for the price above: a derived figure is €/kg or €/L whatever
// reference_format originally claimed.
export function mercadonaReferenceFormat(f: MercadonaPriceFields): string | null {
  if (f.price && f.price > 0 && mercadonaPackageMassKg(f)) {
    return (f.sizeFormat ?? '').toLowerCase() === 'l' ? 'L' : 'kg';
  }
  return f.referenceFormat ?? null;
}
