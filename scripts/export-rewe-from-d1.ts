#!/usr/bin/env bun
// Export the live REWE products from the protein-index D1 database into
// data/rewe-products.json — the source the site build consumes. This is what
// makes the extension's crowd-sourced updates show up on the site:
//
//   export-rewe-from-d1.ts            (D1 -> data/rewe-products.json)
//   build-protein-site.ts             (-> public/{index.html,rewe.json,...})
//   (cd ../mercadona-protein-site && wrangler deploy)
//
// Runs `wrangler d1 execute` under the site dir (where the D1 binding lives).

import { writeFileSync } from 'node:fs';

const SITE_DIR = '/Users/mohamed/personal/extensions/mercadona-protein-site';
const OUT = `${import.meta.dir}/../data/rewe-products.json`;

const SQL =
  'SELECT shop_id, name, url, image_url, categories, price, price_per_unit, unit, brand, gtin, nutritional_data ' +
  "FROM product WHERE shop='rewe'";

const proc = Bun.spawn(
  ['wrangler', 'd1', 'execute', 'nutridata', '--remote', '--json', '--command', SQL],
  { cwd: SITE_DIR, stdout: 'pipe', stderr: 'inherit' },
);
const out = await new Response(proc.stdout).text();
if ((await proc.exited) !== 0) throw new Error('wrangler d1 execute failed');

// wrangler --json prints `[{ results: [...], success, meta }]`
const parsed = JSON.parse(out.slice(out.indexOf('[')));
const rows: any[] = parsed[0].results;

const num = (s: string | null): number | null => {
  if (s == null || s === '') return null;
  const m = String(s).replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null;
};
const kcal = (s: string | null): number | null => {
  if (s == null || s === '') return null; const v = num(s); if (v === null) return null;
  return /kj/i.test(String(s)) && !/kcal/i.test(String(s)) ? Math.round(v / 4.184) : v;
};

let noNutri = 0;
const products = [];
for (const r of rows) {
  let n: Record<string, string> = {};
  if (r.nutritional_data) { try { n = JSON.parse(r.nutritional_data); } catch {} }
  const protein = num(n.protein), calories = kcal(n.calories);
  if (protein === null && calories === null) { noNutri++; continue; }
  // compact order matches Mercadona: [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
  const nutri = [protein, num(n.carbs), num(n.sugar), num(n.fat), calories, num(n.fiber), num(n.salt), num(n.saturatedFat)];
  let cats: string[] = [];
  if (r.categories) { try { cats = JSON.parse(r.categories); } catch {} }
  products.push({
    id: r.shop_id, name: r.name || '', url: r.url || '', img: r.image_url || '',
    cats, price: r.price, ppu: r.price_per_unit, unit: r.unit, brand: r.brand, sub: null, gtin: r.gtin, nutri,
  });
}
writeFileSync(OUT, JSON.stringify(products));
console.log(`exported ${products.length} REWE products from D1 -> ${OUT}  (skipped no-nutrition=${noNutri})`);
