#!/usr/bin/env bun
// Export crowd-sourced Mercadona prices from the protein-index D1 database into
// data/mercadona-d1-prices.json, which patch-mercadona-media.ts overlays onto
// the card set. Mercadona cards are built from the OCR/jsonl bundle rather than
// from D1 (that's where the nutrition lives), so without this step the prices
// the extension collects never reach the site:
//
//   export-mercadona-prices-from-d1.ts  (D1 -> data/mercadona-d1-prices.json)
//   patch-mercadona-media.ts            (-> data/mercadona-cards.json)
//   build-protein-site.ts               (-> public/{index.html,mercadona.json,...})
//   (cd ../mercadona-protein-site && wrangler deploy)
//
// Runs `wrangler d1 execute` under the site dir (where the D1 binding lives).

import { writeFileSync } from 'node:fs';

const SITE_DIR = `${import.meta.dir}/../../mercadona-protein-site`;
const OUT = `${import.meta.dir}/../data/mercadona-d1-prices.json`;

const SQL =
  'SELECT shop_id, price, updated_at FROM product ' +
  "WHERE shop='mercadona' AND price IS NOT NULL";

const proc = Bun.spawn(
  ['wrangler', 'd1', 'execute', 'nutridata', '--remote', '--json', '--command', SQL],
  { cwd: SITE_DIR, stdout: 'pipe', stderr: 'inherit' },
);
const stdout = await new Response(proc.stdout).text();
if ((await proc.exited) !== 0) throw new Error('wrangler d1 execute failed');

const parsed = JSON.parse(stdout.slice(stdout.indexOf('[')));
const rows: { shop_id: string; price: number; updated_at: string }[] = parsed[0].results;

const prices: Record<string, { price: number; at: string }> = {};
for (const row of rows) prices[String(row.shop_id)] = { price: row.price, at: row.updated_at };

writeFileSync(OUT, JSON.stringify(prices));
console.log(`exported ${Object.keys(prices).length} Mercadona prices from D1 -> ${OUT}`);
