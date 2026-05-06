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
//     protein-per-€ / protein-per-100-kcal (same formula as src/metrics.ts),
//     and emit the final index.html with search + sort dropdown.

import { appendFile, open, readFile, writeFile, access } from 'node:fs/promises';

const SOURCE_HTML = '/Users/mohamed/personal/extensions/NutriData/mercadona-nutriscore.html';
const HTML = '/Users/mohamed/personal/extensions/mercadona-protein-site/public/index.html';
const NUTRIENTS_BUNDLE = '/Users/mohamed/personal/extensions/NutriData/public/mercadona-nutrients.json';
const JSONL = '/Users/mohamed/personal/extensions/NutriData/data/mercadona-media.jsonl';
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
  let nutriScore: number | null = null;
  if (ppc != null && isFinite(ppc100)) {
    const fiberBonus = fiber && fiber > 0 ? 1 + Math.min(fiber / 8, 0.15) : 1;
    const satFatPenalty = satFat && satFat > 0 ? 1 - Math.min(satFat / 100, 0.5) : 1;
    nutriScore = Math.pow(ppc100, 0.65) * Math.pow(ppc, 0.35) * fiberBonus * satFatPenalty;
  }
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

// --- render ---
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const resize = (u: string) => `${u.split('?')[0]}?fit=crop&h=300&w=300`;

function lerpColor(v: number | null, good: number, bad: number): string {
  if (v == null || !isFinite(v)) return '#9ca3af';
  const red = [220, 38, 38], yellow = [202, 138, 4], green = [22, 163, 74];
  if (v <= bad) return `rgb(${red.join(',')})`;
  if (v >= good) return `rgb(${green.join(',')})`;
  const mid = (good + bad) / 2;
  const [a, b, f] = v < mid ? [red, yellow, (v - bad) / (mid - bad)] : [yellow, green, (v - mid) / (good - mid)];
  const c = a.map((ch, i) => Math.round(ch + f * (b[i] - ch)));
  return `rgb(${c.join(',')})`;
}

const fmt1 = (n: number | null) => (n == null || !isFinite(n) ? '–' : n.toFixed(1));

const categoryCounts = new Map<string, number>();
const subsByCategory = new Map<string, Map<string, number>>();
for (const c of cards) {
  const cat = c.api.category;
  const sub = c.api.subcategory;
  if (cat) {
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    if (sub && sub !== cat) {
      let m = subsByCategory.get(cat);
      if (!m) { m = new Map(); subsByCategory.set(cat, m); }
      m.set(sub, (m.get(sub) || 0) + 1);
    }
  }
}
const subsByCategoryJson = JSON.stringify(
  Object.fromEntries(
    [...subsByCategory.entries()].map(([cat, m]) => [
      cat,
      [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, c]) => [n, c] as const),
    ])
  )
);

// ---- basecoat custom-select markup helpers ----
// Docs: https://basecoatui.com/components/select/
// Triggering 'change' on the root yields detail.value; basecoat syncs the
// hidden input + trigger span automatically.
type BcOption = { value: string; label: string; count?: number | null };
function renderBcSelect(cfg: {
  id: string;
  placeholder: string;
  options: BcOption[];
  initialValue?: string;
  search?: boolean;
  disabled?: boolean;
  triggerClass?: string;
  popoverClass?: string;
}): string {
  const { id, placeholder, options, initialValue = '', search = false, disabled = false } = cfg;
  const triggerClass = cfg.triggerClass || 'w-full sm:w-[12rem]';
  const popoverClass = cfg.popoverClass || '';
  const chevron = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground opacity-50 shrink-0"><path d="m6 9 6 6 6-6"/></svg>`;
  const searchHeader = search
    ? `<header>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Search…" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="${id}-listbox" aria-labelledby="${id}-trigger" />
      </header>`
    : '';
  const labelFor = (o: BcOption) => o.count != null ? `${o.label} (${o.count.toLocaleString()})` : o.label;
  const optHtml = options.map((o, i) =>
    `        <div id="${id}-opt-${i}" role="option" data-value="${esc(o.value)}">${esc(labelFor(o))}</div>`
  ).join('\n');
  // Pre-set the trigger label to match the initial option so basecoat doesn't
  // have to swap it in (avoids a visible "(N)" flicker on slow first paint).
  const matchedOption = options.find(o => o.value === initialValue);
  const hasSelection = !!matchedOption && initialValue !== '';
  const triggerText = matchedOption ? labelFor(matchedOption) : placeholder;
  const triggerSpanClass = hasSelection ? 'truncate' : 'truncate';
  return `<div id="${id}" class="select">
    <button type="button" class="btn-outline ${triggerClass}" id="${id}-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-listbox"${disabled ? ' disabled="disabled"' : ''}>
      <span class="${triggerSpanClass}">${esc(triggerText)}</span>
      ${chevron}
    </button>
    <div id="${id}-popover" data-popover aria-hidden="true" class="${popoverClass}">${searchHeader}
      <div role="listbox" id="${id}-listbox" aria-orientation="vertical" aria-labelledby="${id}-trigger" class="max-h-[60vh] overflow-y-auto">
${optHtml}
      </div>
    </div>
    <input type="hidden" name="${id}-value" value="${esc(initialValue)}" />
  </div>`;
}

const catBcOptions: BcOption[] = [
  { value: '', label: 'All categories', count: cards.length },
  ...[...categoryCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ value: name, label: name, count: n })),
];
const sortBcOptions: BcOption[] = [
  { value: 'score', label: 'NutriScore (highest)' },
  { value: 'ppe', label: 'Protein per € (highest)' },
  { value: 'ppk', label: 'Protein per 100 kcal (highest)' },
  { value: 'protein', label: 'Most protein per 100 g' },
  { value: 'cheapest', label: 'Cheapest unit price' },
  { value: 'bestkg', label: 'Best price per kg/L' },
  { value: 'lowcal', label: 'Fewest calories per 100 g' },
  { value: 'alpha', label: 'Name (A → Z)' },
];

const catSelectHtml = renderBcSelect({
  id: 'cat', placeholder: 'All categories', options: catBcOptions, search: true,
  initialValue: '', triggerClass: 'w-full sm:w-[12rem]',
});
const subSelectHtml = renderBcSelect({
  id: 'sub', placeholder: 'All subcategories',
  options: [{ value: '', label: 'All subcategories' }],
  initialValue: '', disabled: true, triggerClass: 'w-full sm:w-[12rem]',
});
const sortSelectHtml = renderBcSelect({
  id: 'sort', placeholder: 'NutriScore (highest)', options: sortBcOptions,
  initialValue: 'score', triggerClass: 'w-full sm:w-[15rem]',
});

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
).replace(/</g, '\\u003c');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NutriData: independent nutrition index for Mercadona products</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  // Map the shadcn-style theme tokens that basecoat-css ships (--background,
  // --foreground, --card, …) into Tailwind utilities so classes like
  // bg-background / text-muted-foreground / border-border resolve.
  tailwind.config = {
    // Tailwind v3 Play CDN injects its styles after basecoat's <link>, and
    // its preflight (border-width: 0, transparent backgrounds) wipes the
    // basecoat input/select styling. Basecoat ships its own preflight, so
    // turn Tailwind's off.
    corePlugins: { preflight: false },
    theme: {
      extend: {
        colors: {
          border: 'var(--border)',
          input: 'var(--input)',
          ring: 'var(--ring)',
          background: 'var(--background)',
          foreground: 'var(--foreground)',
          primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
          secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
          destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
          muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
          accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
          popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
          card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        },
        borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      },
    },
  };
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/basecoat-css@0.3.11/dist/basecoat.cdn.min.css">
<script src="https://cdn.jsdelivr.net/npm/basecoat-css@0.3.11/dist/js/all.min.js" defer></script>
<style>
  html, body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
  [data-popover] { transition: none !important; animation: none !important; }

  /* Cards are rendered client-side from compact JSON. Keep the card styles in
     a shared ruleset so the HTML stays small when users load more results. */
  .card-tile {
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--card-foreground);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: box-shadow 150ms, border-color 150ms, transform 150ms;
    text-decoration: none;
    /* content-visibility still helps once users load larger result batches. */
    content-visibility: auto; contain-intrinsic-size: auto 460px;
  }
  .card-tile:hover {
    border-color: var(--ring);
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
  .card-tile .imgwrap { position: relative; background: var(--muted); }
  .card-tile img {
    aspect-ratio: 1 / 1; width: 100%; object-fit: contain; padding: 0.75rem;
  }
  .card-tile .rank, .card-tile .score {
    position: absolute; top: 0.5rem;
    display: inline-flex; align-items: center;
    border-radius: 0.375rem;
    font-variant-numeric: tabular-nums;
  }
  .card-tile .rank {
    left: 0.5rem;
    background: var(--foreground); color: var(--background);
    padding: 2px 6px;
    font-size: 10px; font-weight: 500;
  }
  .card-tile .score {
    right: 0.5rem;
    padding: 2px 8px;
    font-size: 12px; font-weight: 600; color: white;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.1);
  }
  .card-tile .body {
    flex: 1;
    padding: 0.625rem 0.75rem 0.75rem;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .card-tile h3, .card-tile .es, .card-tile .crumb {
    display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
    margin: 0;
  }
  .card-tile h3 {
    font-size: 14px; font-weight: 500; line-height: 1.25;
    color: var(--foreground);
    -webkit-line-clamp: 2;
  }
  .card-tile .es {
    font-size: 12px; font-style: italic;
    color: var(--muted-foreground);
    -webkit-line-clamp: 1;
  }
  /* Override the shared -webkit-box rule above: flex gives each span its own
     bbox so clicks land cleanly on cat vs sub instead of overlapping in the
     vertical box. line-height + max-height clamps to ~2 lines. */
  .card-tile .crumb {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.25rem;
    font-size: 10px; font-weight: 500; letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted-foreground);
    line-height: 1.3;
    max-height: calc(1.3em * 3);
  }
  .card-tile .crumb-link {
    cursor: pointer;
    border-radius: 2px;
    transition: color 120ms;
  }
  .card-tile .crumb-link:hover,
  .card-tile .crumb-link:focus-visible {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 2px;
    outline: none;
  }
  .card-tile .crumb-sep { opacity: 0.6; }
  .card-tile .metrics {
    margin-top: 0.375rem;
    display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.5rem;
    font-size: 12px;
  }
  .card-tile .metrics b { font-weight: 600; font-variant-numeric: tabular-nums; }
  .card-tile .metrics u { font-weight: 400; color: var(--muted-foreground); text-decoration: none; }
  .card-tile .foot {
    margin-top: auto; padding-top: 0.5rem;
    display: flex; align-items: end; justify-content: space-between; gap: 0.5rem;
    font-size: 12px; color: var(--muted-foreground);
  }
  .card-tile .foot > div { display: flex; flex-direction: column; line-height: 1.2; }
  .card-tile .foot > .r { align-items: flex-end; }
  .card-tile .foot b {
    font-weight: 500; color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .card-tile .foot .tiny { font-size: 11px; font-variant-numeric: tabular-nums; }
  .card-tile .foot .price {
    font-weight: 600; color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .card-tile .nutri {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--border);
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0.125rem 0.5rem;
    font-size: 11px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .card-tile .nutri div { display: flex; justify-content: space-between; gap: 0.25rem; }
  .card-tile .nutri b { font-weight: 600; color: var(--foreground); }
</style>
</head>
<body class="min-h-screen bg-background text-foreground antialiased">
<div class="mx-auto max-w-[1400px] px-4 py-6 sm:py-10">
  <header class="mb-5 sm:mb-7">
    <div class="flex flex-wrap items-baseline gap-3">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">NutriData index for Mercadona products</h1>
      <span class="text-sm tabular-nums text-muted-foreground">${cards.length.toLocaleString()} products</span>
    </div>
    <p class="mt-1.5 max-w-3xl text-sm text-muted-foreground">Independent project by <span class="font-medium text-foreground">NutriData</span> using product information from Mercadona's online store. <span class="font-medium text-foreground">Not affiliated with or endorsed by Mercadona.</span></p>
    <p class="mt-2 max-w-3xl text-sm text-muted-foreground">Ranked by <span class="font-medium text-foreground">NutriScore</span> — a geometric mean of protein-per-100-kcal and protein-per-€, lifted by fiber and dragged down by saturated fat.</p>
  </header>

  <div class="form sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-background px-4 py-3">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div class="relative min-w-0 flex-1">
        <svg class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" type="search" placeholder="Search products, brands, categories…" autocomplete="off" spellcheck="false" class="input !pl-9">
      </div>
      <div class="grid grid-cols-1 gap-2 sm:flex sm:flex-none sm:items-center">
        ${catSelectHtml}
        <div id="sub-slot">${subSelectHtml}</div>
        ${sortSelectHtml}
      </div>
    </div>
    <p id="count" class="mt-2 min-h-[1em] text-xs tabular-nums text-muted-foreground">Loading products…</p>
  </div>

  <div id="empty" class="hidden py-16 text-center">
    <p class="text-sm text-muted-foreground">No products match these filters.</p>
  </div>

  <div id="grid" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
  </div>

  <div id="more-wrap" class="mt-6 hidden justify-center">
    <button id="show-more" type="button" class="btn-outline">Show more</button>
  </div>

  <footer class="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
    Product links open on <a href="https://tienda.mercadona.es/" target="_blank" rel="noopener" class="underline-offset-2 hover:text-foreground hover:underline">Mercadona's official online store</a>. Product data and images are referenced from Mercadona product pages for identification. <a href="https://github.com/mohamed3on/NutriData" target="_blank" rel="noopener" class="underline-offset-2 hover:text-foreground hover:underline">NutriData</a> is independent and not affiliated with or endorsed by Mercadona.
  </footer>
</div>
<script id="card-data" type="application/json">${clientCardsJson}</script>
<script>
  const PAGE_SIZE = 60;
  const SUBS = ${subsByCategoryJson};
  const DATA = JSON.parse(document.getElementById('card-data')?.textContent || '[]');
  const grid = document.getElementById('grid');
  const input = document.getElementById('search');
  const subSlot = document.getElementById('sub-slot');
  const count = document.getElementById('count');
  const emptyEl = document.getElementById('empty');
  const moreWrap = document.getElementById('more-wrap');
  const showMoreButton = document.getElementById('show-more');

  // Basecoat fires CustomEvent('change', { detail: { value } }) on the .select
  // root. We mirror the current values into these vars so the filter/sort code
  // doesn't care whether selects are native or custom.
  let catValue = '';
  let subValue = '';
  let sortValue = 'score';
  let renderLimit = PAGE_SIZE;
  let matched = [];
  let refreshFrame = 0;
  let inputTimer = 0;

  function getVal(id) {
    const h = document.querySelector('#' + id + ' input[type="hidden"]');
    return h ? h.value : '';
  }
  const norm = s => s.toLowerCase().normalize('NFD').replace(/\\p{Diacritic}/gu, '');
  const productUrl = id => 'https://tienda.mercadona.es/product/' + id + '/';

  // attr: dataset key. dir: 1=ascending, -1=descending. kind: 'num' or 'str'.
  // missing IDs (no value) get pushed to the end via Infinity / -Infinity.
  const SORTS = {
    score:    { key: 'ns', dir: -1, kind: 'num' },
    ppe:      { key: 'pe', dir: -1, kind: 'num' },
    ppk:      { key: 'pk', dir: -1, kind: 'num' },
    protein:  { key: 'p', dir: -1, kind: 'num' },
    cheapest: { key: 'pr', dir:  1, kind: 'num' },
    bestkg:   { key: 'kg', dir:  1, kind: 'num' },
    lowcal:   { key: 'cal', dir:  1, kind: 'num' },
    alpha:    { key: 'sn', dir:  1, kind: 'str' },
  };

  function lerpColor(v, good, bad) {
    if (v == null || !isFinite(v)) return '#9ca3af';
    const red = [220, 38, 38], yellow = [202, 138, 4], green = [22, 163, 74];
    if (v <= bad) return 'rgb(' + red.join(',') + ')';
    if (v >= good) return 'rgb(' + green.join(',') + ')';
    const mid = (good + bad) / 2;
    const lo = v < mid ? red : yellow;
    const hi = v < mid ? yellow : green;
    const factor = v < mid ? (v - bad) / (mid - bad) : (v - mid) / (good - mid);
    const color = lo.map((ch, i) => Math.round(ch + factor * (hi[i] - ch)));
    return 'rgb(' + color.join(',') + ')';
  }

  function fmt1(n) {
    return n == null || !isFinite(n) ? '–' : n.toFixed(1);
  }

  function formatPrice(n) {
    return n == null || !isFinite(n) ? '' : '€' + n.toFixed(2);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nutriRow(label, val, unit = 'g', digits = 1) {
    if (val == null || !isFinite(val)) return '';
    return '<div><span>' + label + '</span><b>' + Number(val).toFixed(digits) + unit + '</b></div>';
  }

  function renderCrumb(cat, sub) {
    if (!cat) return '';
    const parts = ['<span class="crumb-link" data-crumb-cat="' + escHtml(cat) + '" role="button" tabindex="0">' + escHtml(cat) + '</span>'];
    if (sub && sub !== cat) {
      parts.push('<span class="crumb-sep" aria-hidden="true">›</span>');
      parts.push('<span class="crumb-link" data-crumb-cat="' + escHtml(cat) + '" data-crumb-sub="' + escHtml(sub) + '" role="button" tabindex="0">' + escHtml(sub) + '</span>');
    }
    return '<p class="crumb">' + parts.join('') + '</p>';
  }

  function renderCard(item, rank) {
    const priceStr = formatPrice(item.pr);
    const refStr = item.kg != null && isFinite(item.kg)
      ? '€' + Number(item.kg).toFixed(2) + '/' + (item.rf || 'kg')
      : '';
    const nutriBlock = [
      nutriRow('Carbs', item.cb),
      nutriRow('Sugar', item.su),
      nutriRow('Fat', item.ft),
      nutriRow('Sat fat', item.sf),
      nutriRow('Fiber', item.fi),
      nutriRow('Salt', item.sa),
    ].filter(Boolean).join('');
    const body = [
      '<h3>' + escHtml(item.n) + '</h3>',
      item.es ? '<p class="es">' + escHtml(item.es) + '</p>' : '',
      renderCrumb(item.cat, item.sub),
      '<div class="metrics"><div><b style="color:' + lerpColor(item.pe, 12, 4) + '">' + fmt1(item.pe) + '</b><u>g/€</u></div><div><b style="color:' + lerpColor(item.pk, 10, 3) + '">' + fmt1(item.pk) + '</b><u>g/100kcal</u></div></div>',
      '<div class="foot"><div class="l"><b>' + Number(item.p).toFixed(1) + 'g protein</b><span class="tiny">' + Math.round(item.cal) + ' kcal</span></div><div class="r">' + (priceStr ? '<span class="price">' + priceStr + '</span>' : '') + (refStr ? '<span class="tiny">' + escHtml(refStr) + '</span>' : '') + '</div></div>',
      nutriBlock ? '<div class="nutri">' + nutriBlock + '</div>' : '',
    ].filter(Boolean).join('');
    return '<a href="' + productUrl(item.id) + '" target="_blank" rel="noopener" class="card-tile"><div class="imgwrap">' + (item.img ? '<img src="' + escHtml(item.img) + '" alt="" loading="lazy" decoding="async">' : '') + '<span class="rank">#' + rank + '</span><span class="score" style="background:' + lerpColor(item.ns, 10, 3) + '">' + fmt1(item.ns) + '</span></div><div class="body">' + body + '</div></a>';
  }

  function renderGrid() {
    const totalMatches = matched.length;
    const visibleCount = Math.min(renderLimit, totalMatches);

    if (totalMatches === 0) {
      grid.innerHTML = '';
      grid.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      moreWrap.classList.add('hidden');
      count.textContent = '0 matching products';
      return;
    }

    const html = [];
    for (let i = 0; i < visibleCount; i++) html.push(renderCard(matched[i], i + 1));
    grid.innerHTML = html.join('');
    grid.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const remaining = totalMatches - visibleCount;
    moreWrap.classList.toggle('hidden', remaining <= 0);
    if (remaining > 0) {
      showMoreButton.textContent = 'Show ' + Math.min(PAGE_SIZE, remaining).toLocaleString() + ' more';
    }

    const active = input.value.trim() || catValue || subValue;
    if (active) {
      count.textContent = remaining > 0
        ? 'Showing ' + visibleCount.toLocaleString() + ' of ' + totalMatches.toLocaleString() + ' matching products'
        : totalMatches.toLocaleString() + ' matching products';
    } else {
      count.textContent = remaining > 0
        ? 'Showing ' + visibleCount.toLocaleString() + ' of ' + DATA.length.toLocaleString() + ' products'
        : DATA.length.toLocaleString() + ' products';
    }
  }

  function recomputeAndRender() {
    const q = norm(input.value.trim());
    const terms = q ? q.split(/\\s+/).filter(Boolean) : [];
    const cfg = SORTS[sortValue] || SORTS.score;
    const { key, dir, kind } = cfg;
    const sentinel = dir > 0 ? Infinity : -Infinity;

    const next = [];
    for (let i = 0; i < DATA.length; i++) {
      const item = DATA[i];
      if (catValue && item.cat !== catValue) continue;
      if (subValue && item.sub !== subValue) continue;
      if (terms.length && !terms.every(t => item.q.includes(t))) continue;
      next.push(item);
    }

    next.sort((a, b) => {
      if (kind === 'str') return dir * ((a[key] || '').localeCompare(b[key] || ''));
      const va = typeof a[key] === 'number' ? a[key] : sentinel;
      const vb = typeof b[key] === 'number' ? b[key] : sentinel;
      if (va === vb) return 0;
      return dir * (va - vb);
    });

    matched = next;
    renderGrid();
  }

  function scheduleRefresh(resetLimit = false, debounceMs = 0) {
    if (resetLimit) renderLimit = PAGE_SIZE;
    if (inputTimer) {
      clearTimeout(inputTimer);
      inputTimer = 0;
    }
    const run = () => {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(recomputeAndRender);
    };
    if (debounceMs > 0) inputTimer = setTimeout(run, debounceMs);
    else run();
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground opacity-50 shrink-0"><path d="m6 9 6 6 6-6"/></svg>';

  function buildSubSelect(cat) {
    const subs = (cat && SUBS[cat]) || null;
    const disabled = !subs || !subs.length;
    const options = subs ? [['', 'All subcategories', null], ...subs.map(([n, c]) => [n, n, c])] : [['', 'All subcategories', null]];
    const optHtml = options.map(([v, label, n], i) =>
      '<div id="sub-opt-' + i + '" role="option" data-value="' + esc(v) + '">' + esc(label + (n != null ? ' (' + n.toLocaleString() + ')' : '')) + '</div>'
    ).join('');
    return (
      '<div id="sub" class="select">' +
      '<button type="button" class="btn-outline w-full sm:w-[12rem]" id="sub-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="sub-listbox"' + (disabled ? ' disabled="disabled"' : '') + '>' +
      '<span class="truncate text-muted-foreground">All subcategories</span>' + CHEVRON + '</button>' +
      '<div id="sub-popover" data-popover aria-hidden="true">' +
      '<div role="listbox" id="sub-listbox" aria-orientation="vertical" aria-labelledby="sub-trigger" class="max-h-[60vh] overflow-y-auto">' +
      optHtml +
      '</div></div>' +
      '<input type="hidden" name="sub-value" value="" />' +
      '</div>'
    );
  }

  function rebuildSub(cat) {
    // Outer-replace so basecoat's MutationObserver sees a fresh .select and
    // re-initialises its popover/listbox handlers for the new options.
    subSlot.innerHTML = buildSubSelect(cat);
    attachSelectListener('sub', v => { subValue = v; scheduleRefresh(true); });
    subValue = '';
  }

  function attachSelectListener(id, onChange) {
    const root = document.getElementById(id);
    if (!root) return;
    root.addEventListener('change', (e) => {
      const v = e?.detail?.value ?? getVal(id);
      onChange(Array.isArray(v) ? (v[0] || '') : (v || ''));
    });
  }

  input.addEventListener('input', () => scheduleRefresh(true, 90));
  attachSelectListener('cat', v => { catValue = v; rebuildSub(catValue); scheduleRefresh(true); });
  attachSelectListener('sub', v => { subValue = v; scheduleRefresh(true); });
  attachSelectListener('sort', v => { sortValue = v || 'score'; scheduleRefresh(true); });
  showMoreButton.addEventListener('click', () => {
    renderLimit += PAGE_SIZE;
    renderGrid();
  });

  // Sync a basecoat select to a chosen value without going through its option
  // click flow — keeps the trigger label, hidden input, aria-selected, and
  // muted-placeholder class in lockstep, then dispatches the same 'change'
  // event the listbox would so existing handlers (rebuildSub, refresh) run.
  function syncSelect(id, value) {
    const root = document.getElementById(id);
    if (!root) return;
    const v = value || '';
    const hidden = root.querySelector('input[type="hidden"]');
    const trigger = root.querySelector('#' + id + '-trigger');
    const triggerSpan = trigger?.querySelector('span');
    const opt = v
      ? root.querySelector('[role="option"][data-value="' + (window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\\\"')) + '"]')
      : root.querySelector('[role="option"][data-value=""]');
    if (hidden) hidden.value = v;
    if (triggerSpan) {
      triggerSpan.textContent = opt ? opt.textContent : v;
      triggerSpan.classList.toggle('text-muted-foreground', !v);
    }
    root.querySelectorAll('[role="option"]').forEach(o => {
      o.setAttribute('aria-selected', o.dataset.value === v ? 'true' : 'false');
    });
    root.dispatchEvent(new CustomEvent('change', { detail: { value: v } }));
  }

  // Crumb clicks live inside the card's <a>; preventDefault stops navigation,
  // stopPropagation keeps middle-click / ctrl-click from opening the product.
  grid.addEventListener('click', (e) => {
    const link = e.target.closest('.crumb-link');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    const cat = link.dataset.crumbCat || '';
    const sub = link.dataset.crumbSub || '';
    syncSelect('cat', cat);              // triggers rebuildSub + refresh
    if (sub) syncSelect('sub', sub);     // sub DOM was just rebuilt synchronously
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = e.target.closest('.crumb-link');
    if (!link) return;
    e.preventDefault();
    link.click();
  });

  scheduleRefresh(true);

  // Pre-warm basecoat's popover machinery: the first open does lazy init
  // (measuring trigger rect, focus trap setup) that costs ~130ms. Triggering
  // a hidden open/close after init absorbs that cost before the user clicks.
  async function prewarmSelects() {
    for (const id of ['cat', 'sort']) {
      const pop = document.getElementById(id + '-popover');
      const trig = document.querySelector('#' + id + '-trigger');
      if (!pop || !trig || trig.disabled) continue;
      const prevVis = pop.style.visibility;
      try {
        pop.style.visibility = 'hidden';
        trig.click();
        await new Promise(r => requestAnimationFrame(r));
        // Basecoat closes on an outside click dispatched to document.
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => requestAnimationFrame(r));
      } finally {
        pop.style.visibility = prevVis;
        pop.setAttribute('aria-hidden', 'true');
        trig.setAttribute('aria-expanded', 'false');
      }
    }
  }
  // window 'load' fires after all deferred scripts (including basecoat) have run.
  window.addEventListener('load', () => setTimeout(prewarmSelects, 0), { once: true });
</script>
</body>
</html>`;

await writeFile(HTML, page);
console.log(`wrote ${HTML} (${cards.length} cards)`);
