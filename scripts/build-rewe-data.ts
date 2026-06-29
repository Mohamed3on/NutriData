#!/usr/bin/env bun
// Transform a Supabase pg_dump into the cleaned REWE product dataset the
// protein-index site builds from.
//
// The dump (plain-SQL `pg_dump`, optionally gzipped) holds a `public.product`
// table whose rows for shop='rewe' already carry structured per-100g nutrition
// (REWE serves it directly — no OCR needed). This reads ONLY that table,
// normalises the nutrition strings into the compact array order, and writes
// data/rewe-products.json.
//
// This is the no-D1 bootstrap path; once D1 is the source of truth,
// export-rewe-from-d1.ts produces the same file from live D1 data instead.
//
// Usage:
//   scripts/build-rewe-data.ts <path-to-dump.(sql|gz)> [out.json]

import { writeFileSync } from 'node:fs';
import { parseArr, num, nz, toNutriArray, readProductCopyBlock } from './lib/rewe-dump';

const IN = process.argv[2];
const OUT = process.argv[3] || `${import.meta.dir}/../data/rewe-products.json`;
if (!IN) { console.error('usage: build-rewe-data.ts <dump.(sql|gz)> [out.json]'); process.exit(1); }

const { rows, col } = readProductCopyBlock(IN);

const out: unknown[] = [];
let noNutri = 0;
for (const line of rows) {
  const f = line.split('\t');
  if (col(f, 'shop') !== 'rewe') continue;
  const nd = col(f, 'nutritional_data');
  let n: Record<string, string> = {};
  if (nd && nd !== '\\N' && nd !== '{}') { try { n = JSON.parse(nd); } catch {} }
  const nutri = toNutriArray(n); // [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
  if (nutri[0] === null && nutri[4] === null) { noNutri++; continue; } // no protein & no calories
  const url = nz(col(f, 'url'));
  out.push({
    id: nz(col(f, 'shop_id')) || col(f, 'id'),
    name: nz(col(f, 'name')) || '',
    url: url ? `https://shop.rewe.de${url}` : '',
    img: nz(col(f, 'image_url')) || '',
    cats: parseArr(col(f, 'categories') ?? ''),
    price: num(col(f, 'price')),
    ppu: num(col(f, 'price_per_unit')),
    unit: nz(col(f, 'unit')),
    brand: nz(col(f, 'brand')),
    gtin: nz(col(f, 'gtin')),
    nutri,
  });
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${out.length} REWE products -> ${OUT}  (skipped no-nutrition=${noNutri})`);
