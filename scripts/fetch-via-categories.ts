#!/usr/bin/env bun
// Way cheaper fetch path: Mercadona's /api/categories/{id}/ response already
// carries every product's display_name, thumbnail (front-of-pack), and
// price_instructions. So we walk ~100 subcategories instead of hammering
// /api/products/{id}/ 2400× — Akamai barely notices.
//
// Appends any new or missing rows into data/mercadona-media.jsonl; products
// already present aren't overwritten unless --refresh is passed.

import { readFile, writeFile, access } from 'node:fs/promises';

const JSONL = '/Users/mohamed/personal/extensions/NutriData/data/mercadona-media.jsonl';
const SOURCE_HTML = '/Users/mohamed/personal/extensions/NutriData/mercadona-nutriscore.html';
const API = 'https://tienda.mercadona.es/api';
const WH = 'vlc1';
const LANG = 'en';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const SUBCAT_DELAY_MS = [350, 700]; // small jitter between subcategory fetches

// Same roots the Python harvest script uses.
const FOOD_ROOTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 24]);

const REFRESH = process.argv.includes('--refresh');

const fileExists = async (p: string) => access(p).then(() => true).catch(() => false);
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
const jitter = () => SUBCAT_DELAY_MS[0] + Math.random() * (SUBCAT_DELAY_MS[1] - SUBCAT_DELAY_MS[0]);

const headers = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'Referer': 'https://tienda.mercadona.es/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers });
    if (r.ok) return r.json();
    if (r.status === 403 || r.status === 429 || r.status >= 500) {
      const wait = 1500 * Math.pow(2, attempt);
      console.warn(`  ${r.status} ${url} — retry in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${r.status} ${url}`);
  }
  throw new Error(`retries exhausted: ${url}`);
}

// --- parse Spanish names from the pristine HTML (preserved for each card) ---
const existingHtml = await readFile(SOURCE_HTML, 'utf8');
const esNames = new Map<string, string>();
for (const m of existingHtml.matchAll(
  /<a href="https:\/\/tienda\.mercadona\.es\/product\/(\d+)\/"[\s\S]*?<h3 class="[^"]*">([^<]+)<\/h3>/g
)) esNames.set(m[1], m[2]);

// --- load existing jsonl ---
const existing = new Map<string, any>();
if (await fileExists(JSONL)) {
  for (const line of (await readFile(JSONL, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.product_id) existing.set(r.product_id, r); } catch {}
  }
}
console.log(`existing jsonl: ${existing.size} rows  (refresh=${REFRESH})`);

// --- discover subcategory IDs under food roots ---
const rootListing = await fetchJson(`${API}/categories/?lang=${LANG}&wh=${WH}`);
const subcatIds: number[] = [];
for (const root of rootListing.results || []) {
  if (!FOOD_ROOTS.has(root.id)) continue;
  for (const sub of (root.categories || [])) {
    if (typeof sub.id === 'number') subcatIds.push(sub.id);
  }
}
console.log(`walking ${subcatIds.length} food subcategories`);

// --- walk each subcategory, harvest inline products ---
type Row = {
  product_id: string;
  name_en: string | null;
  name_es: string | null;
  ean: string | null;
  image_primary: string | null;
  image_nutrition: string | null;
  price: number | null;
  price_per_kg: number | null;
  unit_size: number | null;
  reference_format: string | null;
  size_format: string | null;
  category_id: number | null;
  category: string | null;
  subcategory_id: number | null;
  subcategory: string | null;
};

function toRow(p: any, leafCat: { id: number | null; name: string | null }): Row | null {
  const id = p?.id != null ? String(p.id) : null;
  if (!id) return null;
  const pi = p.price_instructions || {};
  const topCat = (p.categories || []).find((c: any) => c.level === 0) || (p.categories || [])[0] || null;
  return {
    product_id: id,
    name_en: p.display_name || null,
    name_es: esNames.get(id) || null,
    ean: null, // not present in category response; fine for the deployed site
    image_primary: p.thumbnail || null,
    image_nutrition: null, // not in category response; not needed for the site
    price: pi.unit_price != null ? +pi.unit_price : null,
    price_per_kg: pi.reference_price != null ? +pi.reference_price : null,
    unit_size: pi.unit_size != null ? +pi.unit_size : null,
    reference_format: pi.reference_format || null,
    size_format: pi.size_format || null,
    category_id: topCat?.id ?? null,
    category: topCat?.name ?? null,
    subcategory_id: leafCat.id,
    subcategory: leafCat.name,
  };
}

// Tracks the deepest category we've descended into (the immediate parent of
// the current product list) so we can record it as the product's subcategory.
function walk(node: any, out: Map<string, Row>, leaf: { id: number | null; name: string | null }) {
  const here = node?.name ? { id: node.id ?? leaf.id, name: node.name } : leaf;
  for (const p of (node.products || [])) {
    const row = toRow(p, here);
    if (row) out.set(row.product_id, row);
  }
  for (const c of (node.categories || [])) walk(c, out, here);
}

const harvested = new Map<string, Row>();
let done = 0;
for (const subId of subcatIds) {
  try {
    const data = await fetchJson(`${API}/categories/${subId}/?lang=${LANG}&wh=${WH}`);
    walk(data, harvested, { id: data?.id ?? subId, name: data?.name ?? null });
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${subcatIds.length}  harvested=${harvested.size}`);
  } catch (e: any) {
    console.warn(`  cat ${subId} failed: ${e.message}`);
  }
  await sleep(jitter());
}
console.log(`harvested ${harvested.size} unique products from ${done}/${subcatIds.length} subcategories`);

// --- merge into jsonl ---
// Always merge in newly-captured category fields (cheap, additive). Other
// fields: overwrite only if --refresh, otherwise keep the older value when
// present.
let added = 0, updated = 0, kept = 0;
for (const [id, row] of harvested) {
  const prev = existing.get(id);
  if (!prev) {
    existing.set(id, row);
    added++;
  } else if (REFRESH) {
    existing.set(id, { ...row, ean: row.ean ?? prev.ean, image_nutrition: row.image_nutrition ?? prev.image_nutrition });
    updated++;
  } else {
    // fill in any null fields from the fresh row (lets us backfill category on old rows)
    const merged = { ...prev };
    for (const k of Object.keys(row) as (keyof typeof row)[]) {
      if (merged[k] == null && row[k] != null) merged[k] = row[k] as any;
    }
    existing.set(id, merged);
    kept++;
  }
}
await writeFile(JSONL, [...existing.values()].map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`wrote ${JSONL}  (added=${added}, updated=${updated}, kept=${kept}, total=${existing.size})`);
