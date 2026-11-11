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
import { rowToProduct } from './lib/rewe-card';

const SITE_DIR = `${import.meta.dir}/../../mercadona-protein-site`;
const OUT = `${import.meta.dir}/../data/rewe-products.json`;

const SQL =
  'SELECT shop_id, name, url, image_url, categories, price, price_per_unit, unit, brand, gtin, nutritional_data, updated_at ' +
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
  const p = rowToProduct(row);
  if (p) products.push(p); else noNutri++; // no protein & no calories
}
writeFileSync(OUT, JSON.stringify(products));
console.log(`exported ${products.length} REWE products from D1 -> ${OUT}  (skipped no-nutrition=${noNutri})`);

