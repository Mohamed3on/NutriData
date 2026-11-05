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
import { toNutriArray } from './lib/rewe-dump';

const SITE_DIR = `${import.meta.dir}/../../mercadona-protein-site`;
const OUT = `${import.meta.dir}/../data/rewe-products.json`;
const UNBUYABLE_OUT = `${import.meta.dir}/../data/rewe-unbuyable.json`;

const SQL =
  'SELECT shop_id, name, url, image_url, categories, price, price_per_unit, unit, brand, gtin, nutritional_data ' +
  "FROM product WHERE shop='rewe' AND gone_at IS NULL"; // gone_at: page 404s, delisted

async function query(sql: string): Promise<any[]> {
  const proc = Bun.spawn(
    ['wrangler', 'd1', 'execute', 'nutridata', '--remote', '--json', '--command', sql],
    { cwd: SITE_DIR, stdout: 'pipe', stderr: 'inherit' },
  );
  const stdout = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error('wrangler d1 execute failed');
  // wrangler --json prints `[{ results: [...], success, meta }]`
  return JSON.parse(stdout.slice(stdout.indexOf('[')))[0].results;
}
const rows = await query(SQL);

let noNutri = 0;
const products = [];
for (const row of rows) {
  let n: Record<string, string> = {};
  if (row.nutritional_data) { try { n = JSON.parse(row.nutritional_data); } catch {} }
  const nutri = toNutriArray(n); // [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
  if (nutri[0] === null && nutri[4] === null) { noNutri++; continue; } // no protein & no calories
  let cats: string[] = [];
  if (row.categories) { try { cats = JSON.parse(row.categories); } catch {} }
  products.push({
    // Some seeded urls read shop.rewe.de/shop/p/…, which REWE redirects to a
    // /shop/shop/p/ path the extension doesn't run on — so it never saw them 404.
    id: row.shop_id, name: row.name || '', url: (row.url || '').replace('rewe.de/shop/p/', 'rewe.de/p/'), img: row.image_url || '',
    cats, price: row.price, ppu: row.price_per_unit, unit: row.unit, brand: row.brand, gtin: row.gtin, nutri,
  });
}
writeFileSync(OUT, JSON.stringify(products));
console.log(`exported ${products.length} REWE products from D1 -> ${OUT}  (skipped no-nutrition=${noNutri})`);

// Products each market can't sell, as reported by the extension from that
// market's product pages: { [market]: [shop_id, …] }. The site hides them for a
// visitor who has picked that market.
const unbuyable: Record<string, string[]> = {};
for (const r of await query("SELECT market, shop_id FROM availability WHERE shop='rewe' AND buyable=0"))
  (unbuyable[r.market] ??= []).push(r.shop_id);
writeFileSync(UNBUYABLE_OUT, JSON.stringify(unbuyable));
console.log(`exported unbuyable lists for ${Object.keys(unbuyable).length} markets -> ${UNBUYABLE_OUT}`);
