#!/usr/bin/env bun
// Generate seed SQL for the protein-index D1 `product` table from the Supabase
// pg_dump. One INSERT OR REPLACE per unique (shop, shop_id); nutrition is kept
// in REWE's native object-with-units shape so it matches what the extension
// POSTs to /collect later.
//
// Usage:
//   scripts/seed-d1.ts <dump.(sql|gz)> <out-seed.sql>
//   (cd ../mercadona-protein-site && wrangler d1 execute nutridata --remote --file=<out-seed.sql>)

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const IN = process.argv[2];
const OUT = process.argv[3];
if (!IN || !OUT) { console.error('usage: seed-d1.ts <dump.(sql|gz)> <out.sql>'); process.exit(1); }

let buf = readFileSync(IN);
if (IN.endsWith('.gz')) buf = gunzipSync(buf);
const text = buf.toString('utf8');

const copyIdx = text.indexOf('COPY public.product (');
const headerEnd = text.indexOf('\n', copyIdx);
const header = text.slice(copyIdx, headerEnd);
const cols = header.slice(header.indexOf('(') + 1, header.indexOf(')')).split(',').map(c => c.trim().replace(/"/g, ''));
const ci = (name: string) => cols.indexOf(name);
const term = text.indexOf('\n\\.\n', headerEnd);
const rows = text.slice(headerEnd + 1, term).split('\n').filter(Boolean);

function parseArr(s: string): string[] {
  s = s.replace(/^{|}$/g, ''); const out: string[] = []; let cur = '', inq = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (c === '"') { inq = !inq; continue; } if (c === ',' && !inq) { out.push(cur); cur = ''; continue; } cur += c; }
  if (cur) out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}
const nz = (v: string) => (!v || v === '\\N' ? null : v);
const q = (v: string | null) => (v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
const r = (v: string | null) => { if (v == null) return 'NULL'; const n = parseFloat(v); return isFinite(n) ? String(n) : 'NULL'; };

const COLS = '(shop,shop_id,name,url,image_url,categories,price,price_per_unit,unit,brand,gtin,nutritional_data)';
const seen = new Set<string>();
const tuples: string[] = [];
for (const line of rows) {
  const f = line.split('\t');
  if (f[ci('shop')] !== 'rewe') continue;
  const id = nz(f[ci('shop_id')]) || f[ci('id')];
  if (!id || seen.has(id)) continue;
  seen.add(id);
  const urlRel = nz(f[ci('url')]);
  const cats = parseArr(f[ci('categories')]);
  tuples.push('(' + [
    q('rewe'), q(id), q(nz(f[ci('name')])),
    q(urlRel ? `https://shop.rewe.de${urlRel}` : null),
    q(nz(f[ci('image_url')])),
    q(cats.length ? JSON.stringify(cats) : null),
    r(nz(f[ci('price')])), r(nz(f[ci('price_per_unit')])),
    q(nz(f[ci('unit')])), q(nz(f[ci('brand')])), q(nz(f[ci('gtin')])),
    q(nz(f[ci('nutritional_data')])),
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
