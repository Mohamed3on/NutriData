#!/usr/bin/env bun
// Build the unified protein-index site (Mercadona + REWE store switcher).
//
// Inputs (static, no network):
//   - data/mercadona-cards.json : prebuilt Mercadona card objects (from
//     patch-mercadona-media.ts; bootstrapped once by extracting the card-data
//     blob out of the previously deployed single-store index.html).
//   - data/rewe-products.json   : cleaned REWE products (from the DB dump via
//     build-rewe-data; nutrition + price-per-unit + categories + image).
//
// Output (into the deployed site's asset dir):
//   - public/mercadona.json : Mercadona cards (+ absolute product url `u`)
//   - public/rewe.json      : REWE cards (same shape), ranked by NutriScore
//   - public/index.html     : one page, store toggle, fetches {store}.json
//
// The card shape + NutriScore / protein-per-€ / protein-per-100-kcal formulas
// match patch-mercadona-media.ts and src/metrics.ts exactly, so both stores
// rank on the same scale. Swapping the REWE data source later (e.g. a D1
// rebuild fed by the extension) only means regenerating data/rewe-products.json
// and re-running this script — the site stays identical.

import { readFile, writeFile } from 'node:fs/promises';

const REPO = '/Users/mohamed/personal/extensions/NutriData';
const SITE_DIR = '/Users/mohamed/personal/extensions/mercadona-protein-site/public';
const MERCADONA_CARDS = `${REPO}/data/mercadona-cards.json`;
const REWE_PRODUCTS = `${REPO}/data/rewe-products.json`;
const DEFAULT_STORE = 'mercadona';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const round = (n: number | null | undefined, digits = 1): number | undefined =>
  n == null || !isFinite(n) ? undefined : +n.toFixed(digits);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Mercadona: load prebuilt cards, add absolute product url ----------
type Card = Record<string, unknown> & { id: string };
const mercadonaCards: Card[] = JSON.parse(await readFile(MERCADONA_CARDS, 'utf8'));
for (const c of mercadonaCards) c.u = `https://tienda.mercadona.es/product/${c.id}/`;
console.log(`mercadona: ${mercadonaCards.length} cards`);

// ---------- REWE: build cards from cleaned dump ----------
type ReweProduct = {
  id: string; name: string; url: string; img: string; cats: string[];
  price: number | null; ppu: number | null; unit: string | null;
  brand: string | null; sub: string | null; gtin: string | null;
  nutri: (number | null)[]; // [protein, carbs, sugar, fat, calories, fiber, salt, satFat]
};
const reweProducts: ReweProduct[] = JSON.parse(await readFile(REWE_PRODUCTS, 'utf8'));

// Reject physically-impossible per-100g rows (bad source data). The killer
// case is near-zero calories with real macros: protein-per-100-kcal then
// explodes and the row rockets to the top of the ranking. Mirrors the
// Atwater sanity gate the Mercadona OCR pipeline used.
function isSane(
  protein: number, carbs: number | null, fat: number | null, calories: number
): boolean {
  if (protein < 0 || protein > 100) return false;
  if (!(calories > 0) || calories > 950) return false;
  if (fat != null && (fat < 0 || fat > 100)) return false;
  if (carbs != null && (carbs < 0 || carbs > 105)) return false;
  // Protein is 4 kcal/g, so 100 kcal can hold at most 25 g protein. A higher
  // protein-per-100-kcal is physically impossible → bad calorie value. This is
  // the value the ranking falls back to, so a bogus one rockets to the top.
  if ((protein * 100) / calories > 27) return false;
  const est = 4 * protein + 4 * (carbs || 0) + 9 * (fat || 0); // kcal implied by macros
  if (est > calories * 2 + 10) return false;   // stated kcal implausibly low vs macros
  if (calories > est * 3 + 100) return false;   // stated kcal implausibly high (e.g. kJ mislabel)
  return true;
}

const reweCards: Card[] = [];
const seen = new Set<string>();
let skipNoNutr = 0, skipInsane = 0, dupes = 0;
for (const p of reweProducts) {
  if (seen.has(p.id)) { dupes++; continue; }
  const [protein, carbs, sugar, fat, calories, fiber, salt, satFat] = p.nutri;
  if (protein == null || calories == null || calories <= 0) { skipNoNutr++; continue; }
  if (!isSane(protein, carbs, fat, calories)) { skipInsane++; continue; }
  seen.add(p.id);

  const ppc100 = protein / (calories / 100);
  // price_per_unit is REWE's Grundpreis in €/kg (or €/L) — same role as
  // Mercadona's reference price. protein is per 100g → *10 = per kg.
  const ppu = p.ppu;
  const ppc = ppu && ppu > 0 ? (protein * 10) / ppu : null;

  let nutriScore: number | null = null;
  if (ppc != null && isFinite(ppc100)) {
    const fiberBonus = fiber && fiber > 0 ? 1 + Math.min(fiber / 8, 0.15) : 1;
    const satFatPenalty = satFat && satFat > 0 ? 1 - Math.min(satFat / 100, 0.5) : 1;
    nutriScore = Math.pow(ppc100, 0.65) * Math.pow(ppc, 0.35) * fiberBonus * satFatPenalty;
  }

  // REWE categories are a 3-4 level path (dept > … > leaf). The leaf (e.g.
  // "Mozzarella", "Harzer") is the most useful filter, so map it to `sub`
  // under the top-level dept rather than keeping the coarse second level.
  const cat = p.cats[0] || '';
  const leaf = p.cats.length > 1 ? p.cats[p.cats.length - 1] : '';
  const sub = leaf && leaf !== cat ? leaf : '';
  const name = p.name || '';
  const searchText = norm(`${name} ${p.brand || ''} ${p.cats.join(' ')}`);
  const ns = round(nutriScore, 3);
  const pe = round(ppc, 3);

  reweCards.push({
    id: p.id,
    n: name,
    u: p.url,
    ...(p.img ? { img: p.img } : {}),
    ...(cat ? { cat } : {}),
    ...(sub ? { sub } : {}),
    q: searchText,
    sn: norm(name),
    ...(ns !== undefined ? { ns } : {}),
    ...(pe !== undefined ? { pe } : {}),
    pk: round(ppc100, 3) || 0,
    p: round(protein, 1) || 0,
    cal: round(calories, 1) || 0,
    ...(round(p.price, 2) !== undefined ? { pr: round(p.price, 2) } : {}),
    ...(round(ppu, 2) !== undefined ? { kg: round(ppu, 2) } : {}),
    ...(round(carbs, 1) !== undefined ? { cb: round(carbs, 1) } : {}),
    ...(round(sugar, 1) !== undefined ? { su: round(sugar, 1) } : {}),
    ...(round(fat, 1) !== undefined ? { ft: round(fat, 1) } : {}),
    ...(round(satFat, 1) !== undefined ? { sf: round(satFat, 1) } : {}),
    ...(round(fiber, 1) !== undefined ? { fi: round(fiber, 1) } : {}),
    ...(round(salt, 1) !== undefined ? { sa: round(salt, 1) } : {}),
  });
}
reweCards.sort((a, b) => {
  const va = (a.ns as number) ?? (a.pk as number);
  const vb = (b.ns as number) ?? (b.pk as number);
  return vb - va;
});
console.log(`rewe: ${reweCards.length} cards  (skipped no-nutrition=${skipNoNutr}, insane=${skipInsane}, dupes=${dupes})`);

// data is escaped so a stray "</script>" in a name can't break out of context.
const dataJson = (cards: Card[]) => JSON.stringify(cards).replace(/</g, '\\u003c');
await writeFile(`${SITE_DIR}/mercadona.json`, dataJson(mercadonaCards));
await writeFile(`${SITE_DIR}/rewe.json`, dataJson(reweCards));

// ---------- per-store chrome (server-injected config) ----------
const STORES = {
  mercadona: {
    label: 'Mercadona', file: 'mercadona.json', count: mercadonaCards.length,
    h1: 'NutriData index for Mercadona products',
    name: 'Mercadona', home: 'https://tienda.mercadona.es/', homeLabel: "Mercadona's official online store",
  },
  rewe: {
    label: 'REWE', file: 'rewe.json', count: reweCards.length,
    h1: 'NutriData index for REWE products',
    name: 'REWE', home: 'https://shop.rewe.de/', homeLabel: "REWE's official online store",
  },
};

// ---------- static sort select (same options for both stores) ----------
const sortOptions: [string, string][] = [
  ['score', 'NutriScore (highest)'],
  ['ppe', 'Protein per € (highest)'],
  ['ppk', 'Protein per 100 kcal (highest)'],
  ['protein', 'Most protein per 100 g'],
  ['cheapest', 'Cheapest unit price'],
  ['bestkg', 'Best price per kg/L'],
  ['lowcal', 'Fewest calories per 100 g'],
  ['alpha', 'Name (A → Z)'],
];
const chevron = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground opacity-50 shrink-0"><path d="m6 9 6 6 6-6"/></svg>`;
const sortOptHtml = sortOptions
  .map((o, i) => `        <div id="sort-opt-${i}" role="option" data-value="${o[0]}"${o[0] === 'score' ? ' aria-selected="true"' : ''}>${esc(o[1])}</div>`)
  .join('\n');
const sortSelectHtml = `<div id="sort" class="select">
    <button type="button" class="btn-outline w-full sm:w-[15rem]" id="sort-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-listbox">
      <span class="truncate">NutriScore (highest)</span>
      ${chevron}
    </button>
    <div id="sort-popover" data-popover aria-hidden="true" class="">
      <div role="listbox" id="sort-listbox" aria-orientation="vertical" aria-labelledby="sort-trigger" class="max-h-[60vh] overflow-y-auto">
${sortOptHtml}
      </div>
    </div>
    <input type="hidden" name="sort-value" value="score" />
  </div>`;

const def = STORES[DEFAULT_STORE as keyof typeof STORES];

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NutriData: independent protein &amp; nutrition index for Mercadona &amp; REWE</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    corePlugins: { preflight: false },
    theme: {
      extend: {
        colors: {
          border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)',
          background: 'var(--background)', foreground: 'var(--foreground)',
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

  #store-tabs { display: inline-flex; gap: 2px; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--muted); padding: 3px; }
  .store-tab { padding: 0.25rem 0.85rem; font-size: 13px; font-weight: 500; border-radius: 0.375rem; color: var(--muted-foreground); cursor: pointer; border: none; background: transparent; transition: background 120ms, color 120ms; }
  .store-tab[aria-selected="true"] { background: var(--background); color: var(--foreground); box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.08); }
  .store-tab:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

  .card-tile {
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 0.75rem; border: 1px solid var(--border);
    background: var(--card); color: var(--card-foreground);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: box-shadow 150ms, border-color 150ms, transform 150ms;
    text-decoration: none;
    content-visibility: auto; contain-intrinsic-size: auto 430px;
  }
  .card-tile:hover {
    border-color: var(--ring); transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
  .card-tile .imgwrap { position: relative; background: var(--muted); }
  .card-tile img { aspect-ratio: 1 / 1; width: 100%; object-fit: contain; padding: 0.75rem; }
  .card-tile .rank, .card-tile .score {
    position: absolute; top: 0.5rem; display: inline-flex; align-items: center;
    border-radius: 0.375rem; font-variant-numeric: tabular-nums;
  }
  .card-tile .rank { left: 0.5rem; background: var(--foreground); color: var(--background); padding: 2px 6px; font-size: 10px; font-weight: 500; }
  .card-tile .score { right: 0.5rem; padding: 2px 8px; font-size: 12px; font-weight: 600; color: white; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.1); }
  .card-tile .body { flex: 1; padding: 0.625rem 0.75rem 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .card-tile h3, .card-tile .es, .card-tile .crumb { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }
  .card-tile h3 { font-size: 14px; font-weight: 500; line-height: 1.25; color: var(--foreground); -webkit-line-clamp: 2; }
  .card-tile .es { font-size: 12px; font-style: italic; color: var(--muted-foreground); -webkit-line-clamp: 1; }
  .card-tile .crumb {
    display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 0.25rem;
    font-size: 10px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--muted-foreground); line-height: 1.3; max-height: calc(1.3em * 3);
  }
  .card-tile .crumb-link { cursor: pointer; border-radius: 2px; transition: color 120ms; }
  .card-tile .crumb-link:hover, .card-tile .crumb-link:focus-visible { color: var(--foreground); text-decoration: underline; text-underline-offset: 2px; outline: none; }
  .card-tile .crumb-sep { opacity: 0.6; }
  /* Hero row: protein is the headline stat (paired with the NutriScore badge
     up top); price sits quietly to its right. */
  .card-tile .hero { margin-top: auto; padding-top: 0.5rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 0.5rem; }
  .card-tile .protein { display: flex; align-items: baseline; gap: 0.3rem; }
  .card-tile .protein > b { font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--foreground); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .card-tile .protein > span { display: flex; flex-direction: column; font-size: 11px; line-height: 1.2; color: var(--muted-foreground); }
  .card-tile .protein small { font-size: 9.5px; }
  .card-tile .price { display: flex; flex-direction: column; align-items: flex-end; text-align: right; line-height: 1.2; }
  .card-tile .price > b { font-size: 14px; font-weight: 600; color: var(--foreground); font-variant-numeric: tabular-nums; }
  .card-tile .price small { font-size: 10px; color: var(--muted-foreground); }
  /* Supporting efficiency line — quiet, divided off from the hero. */
  .card-tile .ratios { display: flex; flex-wrap: wrap; gap: 0.1rem 0.6rem; margin-top: 0.5rem; padding-top: 0.45rem; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .card-tile .ratios b { font-weight: 600; }
  /* Macro breakdown: present, but the quietest tier — small, muted, no divider. */
  .card-tile .macros { margin-top: 0.45rem; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.15rem 0.7rem; font-size: 10px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .card-tile .macros div { display: flex; justify-content: space-between; gap: 0.25rem; }
  .card-tile .macros b { font-weight: 500; color: var(--foreground); }
</style>
</head>
<body class="min-h-screen bg-background text-foreground antialiased">
<div class="mx-auto max-w-[1400px] px-4 py-6 sm:py-10">
  <header class="mb-5 sm:mb-7">
    <div id="store-tabs" role="tablist" aria-label="Choose store" class="mb-3">
      <button type="button" class="store-tab" role="tab" data-store="mercadona" aria-selected="${DEFAULT_STORE === 'mercadona'}">Mercadona</button>
      <button type="button" class="store-tab" role="tab" data-store="rewe" aria-selected="${DEFAULT_STORE === 'rewe'}">REWE</button>
    </div>
    <div class="flex flex-wrap items-baseline gap-3">
      <h1 id="title" class="text-2xl font-semibold tracking-tight sm:text-3xl">${esc(def.h1)}</h1>
      <span id="total" class="text-sm tabular-nums text-muted-foreground">${def.count.toLocaleString()} products</span>
    </div>
    <p id="blurb" class="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">Ranked by <span class="font-medium text-foreground">NutriScore</span> — protein per 100&#8239;kcal × protein per €, adjusted for fiber &amp; saturated fat. Independent index, not affiliated with ${esc(def.name)}.</p>
  </header>

  <div class="form z-20 -mx-4 mb-4 border-b border-border bg-background px-4 py-3 sm:sticky sm:top-0">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div class="relative min-w-0 flex-1">
        <svg class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" type="search" placeholder="Search products, brands, categories…" autocomplete="off" spellcheck="false" class="input !pl-9">
      </div>
      <div class="grid grid-cols-1 gap-2 sm:flex sm:flex-none sm:items-center">
        <div id="cat-slot"></div>
        <div id="sub-slot"></div>
        ${sortSelectHtml}
        <button type="button" id="reset" class="btn-outline hidden w-full sm:w-auto" aria-label="Reset filters">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          <span>Reset</span>
        </button>
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

  <footer id="footer" class="mt-12 border-t border-border pt-6 text-xs text-muted-foreground"></footer>
</div>
<script>
  const STORES = ${JSON.stringify(STORES)};
  const PAGE_SIZE = 60;
  const params = new URLSearchParams(location.search);
  let store = STORES[params.get('store')] ? params.get('store') : '${DEFAULT_STORE}';

  let DATA = [];
  let SUBS = {};
  let catCounts = {};
  let allLeaves = []; // every leaf category across the store, for the always-on Category filter

  const grid = document.getElementById('grid');
  const input = document.getElementById('search');
  const catSlot = document.getElementById('cat-slot');
  const subSlot = document.getElementById('sub-slot');
  const count = document.getElementById('count');
  const emptyEl = document.getElementById('empty');
  const moreWrap = document.getElementById('more-wrap');
  const showMoreButton = document.getElementById('show-more');
  const resetBtn = document.getElementById('reset');
  const titleEl = document.getElementById('title');
  const totalEl = document.getElementById('total');
  const blurbEl = document.getElementById('blurb');
  const footerEl = document.getElementById('footer');

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
  const productUrl = item => item.u;

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

  function fmt1(n) { return n == null || !isFinite(n) ? '–' : n.toFixed(1); }
  function formatPrice(n) { return n == null || !isFinite(n) ? '' : '€' + n.toFixed(2); }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const proteinStr = Number(item.p) >= 10 ? String(Math.round(item.p)) : Number(item.p).toFixed(1);
    // Supporting efficiency line (the two NutriScore inputs + calories), muted.
    const ratios = [];
    if (item.pe != null && isFinite(item.pe)) ratios.push('<span><b style="color:' + lerpColor(item.pe, 12, 4) + '">' + fmt1(item.pe) + '</b> g/€</span>');
    if (item.pk != null && isFinite(item.pk)) ratios.push('<span><b style="color:' + lerpColor(item.pk, 10, 3) + '">' + fmt1(item.pk) + '</b> g/100kcal</span>');
    ratios.push('<span>' + Math.round(item.cal) + ' kcal</span>');
    // Full macro breakdown — present but the lowest-emphasis tier on the card.
    const macros = [
      nutriRow('Carbs', item.cb), nutriRow('Sugar', item.su), nutriRow('Fat', item.ft),
      nutriRow('Sat fat', item.sf), nutriRow('Fiber', item.fi), nutriRow('Salt', item.sa),
    ].filter(Boolean).join('');
    const body = [
      '<h3>' + escHtml(item.n) + '</h3>',
      item.es ? '<p class="es">' + escHtml(item.es) + '</p>' : '',
      renderCrumb(item.cat, item.sub),
      '<div class="hero">' +
        '<div class="protein"><b>' + proteinStr + '</b><span>g protein<small>per 100g</small></span></div>' +
        (priceStr ? '<div class="price"><b>' + priceStr + '</b>' + (refStr ? '<small>' + escHtml(refStr) + '</small>' : '') + '</div>' : '') +
      '</div>',
      '<div class="ratios">' + ratios.join('') + '</div>',
      macros ? '<div class="macros">' + macros + '</div>' : '',
    ].filter(Boolean).join('');
    return '<a href="' + productUrl(item) + '" target="_blank" rel="noopener" class="card-tile"><div class="imgwrap">' + (item.img ? '<img src="' + escHtml(item.img) + '" alt="" loading="lazy" decoding="async">' : '') + '<span class="rank">#' + rank + '</span><span class="score" style="background:' + lerpColor(item.ns, 10, 3) + '">' + fmt1(item.ns) + '</span></div><div class="body">' + body + '</div></a>';
  }

  function renderGrid() {
    const totalMatches = matched.length;
    const visibleCount = Math.min(renderLimit, totalMatches);
    const active = input.value.trim() || catValue || subValue;
    resetBtn.classList.toggle('hidden', !active);

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
    if (inputTimer) { clearTimeout(inputTimer); inputTimer = 0; }
    const run = () => {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(recomputeAndRender);
    };
    if (debounceMs > 0) inputTimer = setTimeout(run, debounceMs);
    else run();
  }

  const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground opacity-50 shrink-0"><path d="m6 9 6 6 6-6"/></svg>';
  const SEARCH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

  // Derive category counts + subcategory map from the loaded store data.
  function computeCats() {
    catCounts = {};
    SUBS = {};
    const leafCounts = {};
    for (const item of DATA) {
      const cat = item.cat;
      if (!cat) continue;
      catCounts[cat] = (catCounts[cat] || 0) + 1;
      const sub = item.sub;
      if (sub && sub !== cat) {
        (SUBS[cat] = SUBS[cat] || {})[sub] = (SUBS[cat][sub] || 0) + 1;
        leafCounts[sub] = (leafCounts[sub] || 0) + 1;
      }
    }
    for (const cat of Object.keys(SUBS)) {
      SUBS[cat] = Object.entries(SUBS[cat]).sort((a, b) => a[0].localeCompare(b[0]));
    }
    allLeaves = Object.entries(leafCounts).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function buildCatSelect() {
    const cats = Object.keys(catCounts).sort((a, b) => a.localeCompare(b));
    const options = [['', 'All departments', DATA.length], ...cats.map(c => [c, c, catCounts[c]])];
    const optHtml = options.map(([v, label, n], i) =>
      '<div id="cat-opt-' + i + '" role="option" data-value="' + esc(v) + '">' + esc(label + (n != null ? ' (' + n.toLocaleString() + ')' : '')) + '</div>'
    ).join('');
    const searchHeader = '<header>' + SEARCH_SVG + '<input type="text" placeholder="Search…" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="cat-listbox" aria-labelledby="cat-trigger" /></header>';
    catSlot.innerHTML =
      '<div id="cat" class="select">' +
      '<button type="button" class="btn-outline w-full sm:w-[12rem]" id="cat-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="cat-listbox">' +
      '<span class="truncate text-muted-foreground">All departments</span>' + CHEVRON + '</button>' +
      '<div id="cat-popover" data-popover aria-hidden="true">' + searchHeader +
      '<div role="listbox" id="cat-listbox" aria-orientation="vertical" aria-labelledby="cat-trigger" class="max-h-[60vh] overflow-y-auto">' + optHtml + '</div></div>' +
      '<input type="hidden" name="cat-value" value="" />' +
      '</div>';
    attachSelectListener('cat', v => { catValue = v; rebuildSub(catValue); scheduleRefresh(true); });
    catValue = '';
  }

  // The Category (leaf) filter is always usable: it lists every leaf in the
  // store by default (searchable — type "mozz" → Mozzarella), and narrows to
  // the chosen department's leaves once a department is picked.
  function buildSubSelect(cat) {
    const subs = cat && SUBS[cat] ? SUBS[cat] : allLeaves;
    const options = [['', 'All categories', null], ...subs.map(([n, c]) => [n, n, c])];
    const optHtml = options.map(([v, label, n], i) =>
      '<div id="sub-opt-' + i + '" role="option" data-value="' + esc(v) + '">' + esc(label + (n != null ? ' (' + n.toLocaleString() + ')' : '')) + '</div>'
    ).join('');
    const searchHeader = '<header>' + SEARCH_SVG + '<input type="text" placeholder="Search…" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="sub-listbox" aria-labelledby="sub-trigger" /></header>';
    return (
      '<div id="sub" class="select">' +
      '<button type="button" class="btn-outline w-full sm:w-[12rem]" id="sub-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="sub-listbox">' +
      '<span class="truncate text-muted-foreground">All categories</span>' + CHEVRON + '</button>' +
      '<div id="sub-popover" data-popover aria-hidden="true">' + searchHeader +
      '<div role="listbox" id="sub-listbox" aria-orientation="vertical" aria-labelledby="sub-trigger" class="max-h-[60vh] overflow-y-auto">' +
      optHtml +
      '</div></div>' +
      '<input type="hidden" name="sub-value" value="" />' +
      '</div>'
    );
  }

  function rebuildSub(cat) {
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

  function updateChrome(cfg) {
    titleEl.textContent = cfg.h1;
    totalEl.textContent = cfg.count.toLocaleString() + ' products';
    blurbEl.innerHTML = 'Ranked by <span class="font-medium text-foreground">NutriScore</span> — protein per 100\\u202Fkcal × protein per €, adjusted for fiber &amp; saturated fat. Independent index, not affiliated with ' + escHtml(cfg.name) + '.';
    footerEl.innerHTML = 'Product links open on <a href="' + cfg.home + '" target="_blank" rel="noopener" class="underline-offset-2 hover:text-foreground hover:underline">' + escHtml(cfg.homeLabel) + '</a>. Product data and images are referenced from ' + escHtml(cfg.name) + ' product pages for identification. <a href="https://github.com/mohamed3on/NutriData" target="_blank" rel="noopener" class="underline-offset-2 hover:text-foreground hover:underline">NutriData</a> is independent and not affiliated with or endorsed by ' + escHtml(cfg.name) + '.';
    document.querySelectorAll('#store-tabs .store-tab').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.store === store ? 'true' : 'false');
    });
  }

  async function loadStore(s) {
    const cfg = STORES[s];
    if (!cfg) return;
    store = s;
    updateChrome(cfg);
    count.textContent = 'Loading products…';
    // reflect store in the URL so it's shareable / back-button friendly
    const url = new URL(location.href);
    url.searchParams.set('store', s);
    history.replaceState(null, '', url);

    try {
      // Revalidate against the server (assets ship must-revalidate + ETag), so
      // a redeploy of {store}.json is picked up instead of pinned forever.
      const res = await fetch(cfg.file, { cache: 'no-cache' });
      DATA = await res.json();
    } catch (e) {
      count.textContent = 'Failed to load products.';
      return;
    }
    // reset filters for the new store
    input.value = '';
    sortValue = 'score';
    syncSelect('sort', 'score');
    computeCats();
    buildCatSelect();
    rebuildSub('');
    catValue = '';
    subValue = '';
    scheduleRefresh(true);
  }

  input.addEventListener('input', () => scheduleRefresh(true, 90));
  attachSelectListener('sort', v => { sortValue = v || 'score'; scheduleRefresh(true); });
  showMoreButton.addEventListener('click', () => { renderLimit += PAGE_SIZE; renderGrid(); });
  resetBtn.addEventListener('click', () => {
    input.value = '';
    syncSelect('cat', '');
  });
  document.getElementById('store-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.store-tab');
    if (!btn || btn.dataset.store === store) return;
    loadStore(btn.dataset.store);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  grid.addEventListener('click', (e) => {
    const link = e.target.closest('.crumb-link');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    const cat = link.dataset.crumbCat || '';
    const sub = link.dataset.crumbSub || '';
    input.value = '';
    syncSelect('cat', cat);
    if (sub) syncSelect('sub', sub);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = e.target.closest('.crumb-link');
    if (!link) return;
    e.preventDefault();
    link.click();
  });

  loadStore(store);

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
  window.addEventListener('load', () => setTimeout(prewarmSelects, 400), { once: true });
</script>
</body>
</html>`;

await writeFile(`${SITE_DIR}/index.html`, page);
console.log(`wrote ${SITE_DIR}/index.html`);
console.log(`  mercadona.json: ${mercadonaCards.length} cards`);
console.log(`  rewe.json:      ${reweCards.length} cards`);
