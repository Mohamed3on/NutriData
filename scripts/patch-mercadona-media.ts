#!/usr/bin/env bun
// Resumable fetch + site regeneration for the deployed Mercadona page.
//
// Phase 1 (fetch, resumable):
//   - Parse product IDs from the pristine HTML (with Spanish display names).
//   - Load any rows already in data/mercadona-media.jsonl — those IDs are
//     skipped. The jsonl is append-only; each successful fetch is written and
//     flushed immediately, so Ctrl-C (or a rate-limit wall) is safe: just run
//     the script again when you're unblocked.
//   - Fetch missing IDs with modest concurrency + retry/backoff. Failed IDs
//     are NOT persisted and will be retried on the next run.
//
// Phase 2 (generate):
//   - Merge jsonl rows with the nutrients bundle, compute NutriScore /
//     protein-per-€ / protein-per-100-kcal (shared core src/nutriScore.ts),
//     and emit data/mercadona-cards.json for the unified site generator
//     (build-protein-site.ts), which owns the page template + client JS.

import { appendFile, open, readFile, writeFile, access } from 'node:fs/promises';
import { computeNutriScore } from '../src/nutriScore';

const SOURCE_HTML = `${import.meta.dir}/../mercadona-nutriscore.html`;
const MERCADONA_CARDS = `${import.meta.dir}/../data/mercadona-cards.json`;
const NUTRIENTS_BUNDLE = `${import.meta.dir}/../public/mercadona-nutrients.json`;
const JSONL = `${import.meta.dir}/../data/mercadona-media.jsonl`;
const API = 'https://tienda.mercadona.es/api';
const CONCURRENCY = 3;
const RETRIES = 0; // resumable — let blocked requests drop fast and pick up next run
const JITTER_MS = [200, 500]; // per-request sleep between calls in each worker

// Mercadona is fronted by Akamai Bot Manager. Mirroring a real browser session
// (headers + _abck/bm_sz cookies) is the only way to get through. Grab them
// from devtools: right-click a /api/products/* request → Copy as cURL, then
// paste the cookie string into MERCADONA_COOKIE. Tokens last ~1 hour; on
// expiry you'll see 403s again — refresh the env var and rerun.
const COOKIE = process.env.MERCADONA_COOKIE || '';
const UA = process.env.MERCADONA_UA
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
if (!COOKIE) {
  console.error('WARNING: MERCADONA_COOKIE env var is empty — expect 403s from Akamai');
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'DNT': '1',
  'Referer': 'https://tienda.mercadona.es/categories/112',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  ...(COOKIE ? { Cookie: COOKIE } : {}),
};

type Photo = { perspective?: number; zoom?: string; regular?: string };
type ApiRow = {
  product_id: string;
  gone?: boolean; // true if 404'd — permanent, skip in generation
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
  category_id?: number | null;
  category?: string | null;
  subcategory_id?: number | null;
  subcategory?: string | null;
};
type FetchResult =
  | { kind: 'ok'; row: ApiRow }
  | { kind: 'gone' }
  | { kind: 'retry'; reason: string };

const fileExists = async (p: string) => access(p).then(() => true).catch(() => false);
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// --- parse Spanish names from the pristine HTML ---
const existingHtml = await readFile(SOURCE_HTML, 'utf8');
const esNames = new Map<string, string>();
for (const m of existingHtml.matchAll(
  /<a href="https:\/\/tienda\.mercadona\.es\/product\/(\d+)\/"[\s\S]*?<h3 class="[^"]*">([^<]+)<\/h3>/g
)) esNames.set(m[1], m[2]);
console.log(`parsed ${esNames.size} Spanish names`);

// --- load nutrients bundle ---
const nutrientsBundle: Record<string, (number | null)[]> =
  JSON.parse(await readFile(NUTRIENTS_BUNDLE, 'utf8'));
console.log(`loaded ${Object.keys(nutrientsBundle).length} nutrient rows`);

// --- load existing jsonl (resumable) ---
const existing = new Map<string, ApiRow>();
if (await fileExists(JSONL)) {
  for (const line of (await readFile(JSONL, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try {
      const r: ApiRow = JSON.parse(line);
      if (r.product_id) existing.set(r.product_id, r);
    } catch { /* skip malformed */ }
  }
}
console.log(`resumable: ${existing.size} rows already in jsonl`);

// --- photo helpers ---
const pickZoom = (p?: Photo) => (p?.zoom || p?.regular || null);
const pickByPersp = (photos: Photo[], persp: number) =>
  pickZoom(photos.find(p => p.perspective === persp));
const pickPrimary = (photos: Photo[]) => {
  const nonNutrition = photos
    .filter(p => p.perspective !== 9)
    .sort((a, b) => (a.perspective ?? 99) - (b.perspective ?? 99));
  return pickZoom(nonNutrition[0]) ?? pickZoom(photos[0]);
};

async function fetchOne(id: string): Promise<FetchResult> {
  let lastReason = 'unknown';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(`${API}/products/${id}/?lang=en&wh=vlc1`, { headers: BROWSER_HEADERS });
      if (r.status === 404) return { kind: 'gone' };
      if (r.status === 403 || r.status === 429 || r.status >= 500) {
        lastReason = `http_${r.status}`;
        if (attempt === RETRIES) return { kind: 'retry', reason: lastReason };
        await sleep(800 * Math.pow(2, attempt) + Math.random() * 400);
        continue;
      }
      if (!r.ok) return { kind: 'retry', reason: `http_${r.status}` };
      const d: any = await r.json();
      const photos: Photo[] = d.photos || [];
      const pi = d.price_instructions || {};
      return {
        kind: 'ok',
        row: {
          product_id: id,
          name_en: d.display_name || null,
          name_es: esNames.get(id) || null,
          ean: d.ean || null,
          image_primary: pickPrimary(photos),
          image_nutrition: pickByPersp(photos, 9),
          price: pi.unit_price != null ? +pi.unit_price : null,
          price_per_kg: pi.reference_price != null ? +pi.reference_price : null,
          unit_size: pi.unit_size != null ? +pi.unit_size : null,
          reference_format: pi.reference_format || null,
          size_format: pi.size_format || null,
        },
      };
    } catch (e: any) {
      lastReason = 'network_' + (e?.code || e?.message || 'err');
      if (attempt === RETRIES) return { kind: 'retry', reason: lastReason };
      await sleep(800 * Math.pow(2, attempt));
    }
  }
  return { kind: 'retry', reason: lastReason };
}

// --- fetch pending ---
const ids = [...esNames.keys()];
const pending = ids.filter(id => !existing.has(id));
console.log(`${pending.length} pending`);

if (pending.length > 0) {
  const fh = await open(JSONL, 'a');
  let writeQ: Promise<unknown> = Promise.resolve();
  const appendRow = (row: ApiRow) => {
    writeQ = writeQ.then(() => fh.write(JSON.stringify(row) + '\n'));
    return writeQ;
  };

  let idx = 0, ok = 0, gone = 0;
  const retryReasons: Record<string, number> = {};
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (idx < pending.length) {
      const id = pending[idx++];
      const res = await fetchOne(id);
      if (res.kind === 'ok') {
        existing.set(id, res.row);
        await appendRow(res.row);
        ok++;
      } else if (res.kind === 'gone') {
        const stub: ApiRow = {
          product_id: id, gone: true, name_en: null, name_es: esNames.get(id) || null,
          ean: null, image_primary: null, image_nutrition: null,
          price: null, price_per_kg: null, unit_size: null,
          reference_format: null, size_format: null,
        };
        existing.set(id, stub);
        await appendRow(stub);
        gone++;
      } else {
        retryReasons[res.reason] = (retryReasons[res.reason] || 0) + 1;
      }
      const total = ok + gone + Object.values(retryReasons).reduce((a, b) => a + b, 0);
      if (total % 50 === 0) {
        console.log(`  ${total}/${pending.length}  ok=${ok}  gone(404)=${gone}  retry_later=${total - ok - gone}`);
      }
      await sleep(JITTER_MS[0] + Math.random() * (JITTER_MS[1] - JITTER_MS[0]));
    }
  }));
  await writeQ;
  await fh.close();
  const retryTotal = Object.values(retryReasons).reduce((a, b) => a + b, 0);
  console.log(`fetch pass done: ok=${ok}  gone(404)=${gone}  retry_later=${retryTotal}`);
  if (retryTotal) console.log('  reasons:', retryReasons);
}

// --- build cards ---
type Card = {
  api: ApiRow;
  protein: number; carbs: number | null; sugar: number | null;
  fat: number | null; calories: number;
  fiber: number | null; salt: number | null; satFat: number | null;
  nutriScore: number | null;
  proteinPerEuro: number | null;
  proteinPer100Kcal: number;
};
const cards: Card[] = [];
let skippedNoApi = 0, skippedNoNutr = 0;
for (const id of ids) {
  const api = existing.get(id);
  const ocr = nutrientsBundle[id];
  if (!api || api.gone) { skippedNoApi++; continue; }
  if (!ocr) { skippedNoNutr++; continue; }
  const [protein, carbs, sugar, fat, calories, fiber, salt, satFat] = ocr;
  if (protein == null || calories == null || calories <= 0) continue;
  const ppc100 = protein / (calories / 100);
  let ppc: number | null = null;
  if (api.price_per_kg && api.price_per_kg > 0) {
    ppc = (protein * 10) / api.price_per_kg;
  } else if (api.price && api.price > 0 && api.unit_size && api.unit_size > 0) {
    ppc = (protein * 10 * api.unit_size) / api.price;
  }
  const nutriScore = ppc != null && isFinite(ppc100) ? computeNutriScore(ppc100, ppc, fiber, satFat) : null;
  cards.push({
    api, protein, carbs, sugar, fat, calories, fiber, salt, satFat,
    nutriScore, proteinPerEuro: ppc, proteinPer100Kcal: ppc100,
  });
}

cards.sort((a, b) => {
  const va = a.nutriScore ?? a.proteinPer100Kcal;
  const vb = b.nutriScore ?? b.proteinPer100Kcal;
  return vb - va;
});
console.log(`built ${cards.length} cards  (skipped: no_api=${skippedNoApi} no_nutrients=${skippedNoNutr})`);

// --- emit Mercadona cards for the unified site generator (build-protein-site.ts) ---
const resize = (u: string) => `${u.split('?')[0]}?fit=crop&h=300&w=300`;
const round = (n: number | null | undefined, digits = 1): number | undefined =>
  n == null || !isFinite(n) ? undefined : +n.toFixed(digits);

const clientCardsJson = JSON.stringify(
  cards.map((c) => {
    const name = c.api.name_en || c.api.name_es || '';
    const nameEs = c.api.name_es && c.api.name_en && c.api.name_es !== c.api.name_en ? c.api.name_es : '';
    const category = c.api.category || '';
    const subcategory = c.api.subcategory && c.api.subcategory !== c.api.category ? c.api.subcategory : '';
    const price = round(c.api.price, 2);
    const pricePerKg = round(c.api.price_per_kg, 2);
    const carbs = round(c.carbs, 1);
    const sugar = round(c.sugar, 1);
    const fat = round(c.fat, 1);
    const satFat = round(c.satFat, 1);
    const fiber = round(c.fiber, 1);
    const salt = round(c.salt, 1);
    const searchText = (name + ' ' + nameEs + ' ' + category + ' ' + subcategory)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    const sortName = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const ns = round(c.nutriScore, 3);
    const pe = round(c.proteinPerEuro, 3);
    return {
      id: c.api.product_id,
      n: name,
      ...(nameEs ? { es: nameEs } : {}),
      ...(c.api.image_primary ? { img: resize(c.api.image_primary) } : {}),
      ...(category ? { cat: category } : {}),
      ...(subcategory ? { sub: subcategory } : {}),
      q: searchText,
      sn: sortName,
      ...(ns !== undefined ? { ns } : {}),
      ...(pe !== undefined ? { pe } : {}),
      pk: round(c.proteinPer100Kcal, 3) || 0,
      p: round(c.protein, 1) || 0,
      cal: round(c.calories, 1) || 0,
      ...(price !== undefined ? { pr: price } : {}),
      ...(pricePerKg !== undefined ? { kg: pricePerKg } : {}),
      ...(c.api.reference_format ? { rf: c.api.reference_format } : {}),
      ...(carbs !== undefined ? { cb: carbs } : {}),
      ...(sugar !== undefined ? { su: sugar } : {}),
      ...(fat !== undefined ? { ft: fat } : {}),
      ...(satFat !== undefined ? { sf: satFat } : {}),
      ...(fiber !== undefined ? { fi: fiber } : {}),
      ...(salt !== undefined ? { sa: salt } : {}),
    };
  })
);

await writeFile(MERCADONA_CARDS, clientCardsJson);
console.log(`wrote ${cards.length} Mercadona cards -> ${MERCADONA_CARDS}`);
