#!/usr/bin/env bun
// Transform a Supabase pg_dump into the cleaned REWE product dataset the
// protein-index site builds from.
//
// The dump (plain-SQL `pg_dump`, optionally gzipped) holds a `public.product`
// table whose rows for shop='rewe' already carry structured per-100g nutrition
// (REWE serves it directly — no OCR needed). This reads ONLY that table,
// normalises the nutrition strings ("3.9 g" → 3.9, kJ → kcal) into the compact
// array order used everywhere else, and writes data/rewe-products.json.
//
// Usage:
//   scripts/build-rewe-data.ts <path-to-dump.(sql|gz)> [out.json]
// Then: scripts/build-protein-site.ts  (joins this with Mercadona → site)

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const IN = process.argv[2];
const OUT = process.argv[3] || `${import.meta.dir}/../data/rewe-products.json`;
if (!IN) { console.error('usage: build-rewe-data.ts <dump.(sql|gz)> [out.json]'); process.exit(1); }

let sql = readFileSync(IN);
if (IN.endsWith('.gz')) sql = gunzipSync(sql);
const text = sql.toString('utf8');

// --- slice out the `COPY public.product (...) FROM stdin;` data block ---
const copyIdx = text.indexOf('COPY public.product (');
if (copyIdx < 0) throw new Error('public.product COPY block not found');
const headerEnd = text.indexOf('\n', copyIdx);
const header = text.slice(copyIdx, headerEnd);
const cols = header.slice(header.indexOf('(') + 1, header.indexOf(')')).split(',').map(c => c.trim().replace(/"/g, ''));
const col = (f: string[], name: string) => f[cols.indexOf(name)];

const term = text.indexOf('\n\\.\n', headerEnd);
const rows = text.slice(headerEnd + 1, term).split('\n').filter(Boolean);

// --- helpers ---
function parseArr(s: string): string[] {
  s = s.replace(/^{|}$/g, ''); const out: string[] = []; let cur = '', inq = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (c === '"') { inq = !inq; continue; } if (c === ',' && !inq) { out.push(cur); cur = ''; continue; } cur += c; }
  if (cur) out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}
const num = (s: string | undefined): number | null => {
  if (!s || s === '\\N') return null;
  const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null;
};
const kcal = (s: string | undefined): number | null => {
  if (!s || s === '\\N') return null; const v = num(s); if (v === null) return null;
  return /kj/i.test(s) && !/kcal/i.test(s) ? Math.round(v / 4.184) : v;
};
const nn = (s: string | undefined) => (!s || s === '\\N' ? null : s);

const out: unknown[] = [];
let noNutri = 0;
for (const line of rows) {
  const f = line.split('\t');
  if (col(f, 'shop') !== 'rewe') continue;
  const nd = col(f, 'nutritional_data');
  let n: Record<string, string> = {};
  if (nd && nd !== '\\N' && nd !== '{}') { try { n = JSON.parse(nd); } catch {} }
  const protein = num(n.protein), calories = kcal(n.calories);
  if (protein === null && calories === null) { noNutri++; continue; }
  // compact order matches Mercadona: [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
  const nutri = [protein, num(n.carbs), num(n.sugar), num(n.fat), calories, num(n.fiber), num(n.salt), num(n.saturatedFat)];
  const url = nn(col(f, 'url'));
  out.push({
    id: nn(col(f, 'shop_id')) || col(f, 'id'),
    name: col(f, 'name') === '\\N' ? '' : col(f, 'name'),
    url: url ? `https://shop.rewe.de${url}` : '',
    img: nn(col(f, 'image_url')) || '',
    cats: parseArr(col(f, 'categories')),
    price: num(col(f, 'price')),
    ppu: num(col(f, 'price_per_unit')),
    unit: nn(col(f, 'unit')),
    brand: nn(col(f, 'brand')),
    sub: nn(col(f, 'subtitle')),
    gtin: nn(col(f, 'gtin')),
    nutri,
  });
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${out.length} REWE products -> ${OUT}  (skipped no-nutrition=${noNutri})`);
