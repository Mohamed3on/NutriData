#!/usr/bin/env bun
// Generate seed SQL for the protein-index D1 `product` table from the Supabase
// pg_dump. One INSERT OR REPLACE per unique (shop, shop_id); nutrition is kept
// in REWE's native object-with-units shape so it matches what the extension
// POSTs to /collect later.
//
// Usage:
//   scripts/seed-d1.ts <dump.(sql|gz)> <out-seed.sql>
//   (cd ../mercadona-protein-site && wrangler d1 execute nutridata --remote --file=<out-seed.sql>)

import { writeFileSync } from 'node:fs';
import { parseArr, nz, readProductCopyBlock } from './lib/rewe-dump';

const IN = process.argv[2];
const OUT = process.argv[3];
if (!IN || !OUT) { console.error('usage: seed-d1.ts <dump.(sql|gz)> <out.sql>'); process.exit(1); }

const { rows, col } = readProductCopyBlock(IN);

const q = (v: string | null) => (v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
const r = (v: string | null) => { if (v == null) return 'NULL'; const n = parseFloat(v); return isFinite(n) ? String(n) : 'NULL'; };

const COLS = '(shop,shop_id,name,url,image_url,categories,price,price_per_unit,unit,brand,gtin,nutritional_data)';
const seen = new Set<string>();
const tuples: string[] = [];
for (const line of rows) {
  const f = line.split('\t');
  if (col(f, 'shop') !== 'rewe') continue;
  const id = nz(col(f, 'shop_id')) || col(f, 'id');
  if (!id || seen.has(id)) continue;
  seen.add(id);
  const urlRel = nz(col(f, 'url'));
  const cats = parseArr(col(f, 'categories') ?? '');
  tuples.push('(' + [
    q('rewe'), q(id), q(nz(col(f, 'name'))),
    q(urlRel ? `https://shop.rewe.de${urlRel}` : null),
    q(nz(col(f, 'image_url'))),
    q(cats.length ? JSON.stringify(cats) : null),
    r(nz(col(f, 'price'))), r(nz(col(f, 'price_per_unit'))),
    q(nz(col(f, 'unit'))), q(nz(col(f, 'brand'))), q(nz(col(f, 'gtin'))),
    q(nz(col(f, 'nutritional_data'))),
  ].join(',') + ')');
}

// No explicit BEGIN/COMMIT — D1 runs the whole file in one transaction itself
// and rejects SQL transaction statements.
const BATCH = 50; // keep each INSERT under D1's SQLITE_TOOBIG statement limit
const out: string[] = [];
for (let i = 0; i < tuples.length; i += BATCH) {
  out.push(`INSERT OR REPLACE INTO product ${COLS} VALUES\n${tuples.slice(i, i + BATCH).join(',\n')};`);
}
writeFileSync(OUT, out.join('\n'));
console.log(`wrote ${tuples.length} unique REWE rows in ${Math.ceil(tuples.length / BATCH)} batches -> ${OUT}`);
