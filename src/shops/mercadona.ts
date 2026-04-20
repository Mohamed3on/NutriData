import { NutrientInfo, PriceAndWeightInfo, Shop, Metrics } from '../types';
import React from 'react';
import { createCustomSortSelectElement } from '../utils/createCustomSortSelect';
import { isNutrientInfoComplete, parseNumeric } from '../utils';
import { removeMetricsElement } from '../domUtils';

declare const chrome: any;

// Algolia keys are baked into Mercadona's frontend bundle (public, search-only).
const ALGOLIA_APP_ID = '7UZJKL1DJ0';
const ALGOLIA_API_KEY = '9d8f2e39e90df472b4f2e559a116fe17';
const WAREHOUSE = 'vlc1';
const DEFAULT_LANG = 'es';
const INJECTED_LINK_CLASS = 'nutridata-mercadona-link';
const PRODUCT_PATH = /\/product\/(\d+)/;
const productUrl = (id: string) => `https://tienda.mercadona.es/product/${id}/`;

// Mercadona's Algolia indices are language-scoped (`products_prod_<wh>_<lang>`).
// Mirror what the frontend uses — read it off `<html lang>`.
function detectLang(): string {
  const lang = (document.documentElement.lang || DEFAULT_LANG).trim().toLowerCase();
  return lang.split('-')[0] || DEFAULT_LANG;
}

const priceByProductId = new Map<string, PriceAndWeightInfo>();
const inflightPriceFetch = new Map<string, Promise<PriceAndWeightInfo | null>>();

// Bundled productId → compact nutrient array (~2000 Mercadona products, ~190KB).
// One file, one fetch, O(1) lookup. Generated from the OFF dump + harvest.
const NUTRIENTS_PATH = 'mercadona-nutrients.json';
let nutrientsMapPromise: Promise<Record<string, (number | null)[]> | null> | null = null;

function loadNutrientsMap(): Promise<Record<string, (number | null)[]> | null> {
  if (!nutrientsMapPromise) {
    nutrientsMapPromise = fetch(chrome.runtime.getURL(NUTRIENTS_PATH)).then(
      (r) => (r.ok ? r.json() : null),
      () => null
    );
  }
  return nutrientsMapPromise;
}

function compactToNutrientInfo(compact: (number | null)[]): NutrientInfo {
  const [p, c, su, f, k, fi, sa, sf] = compact;
  // EU labels omit nutrients deemed "negligible" — treat null as 0 to surface
  // the product instead of dropping it.
  const fmt = (v: number | null) => (parseNumeric(v) ?? 0).toFixed(1);
  return {
    protein: fmt(p),
    carbs: fmt(c),
    sugar: fmt(su),
    fat: fmt(f),
    calories: fmt(k),
    fiber: fmt(fi),
    salt: fmt(sa),
    saturatedFat: fmt(sf),
  };
}

function toPriceAndWeightInfo(pi: any): PriceAndWeightInfo {
  if (!pi) return {};
  return {
    price: parseNumeric(pi.unit_price) ?? undefined,
    weight: parseNumeric(pi.unit_size) ?? undefined,
    pricePerKg: parseNumeric(pi.reference_price) ?? undefined,
  };
}

async function fetchProductDetails(productId: string): Promise<{ ean: string | null; priceInfo: PriceAndWeightInfo } | null> {
  const r = await fetch(`https://tienda.mercadona.es/api/products/${productId}/`);
  if (!r.ok) return null;
  const data = await r.json();
  return { ean: data?.ean || null, priceInfo: toPriceAndWeightInfo(data?.price_instructions) };
}

async function resolveNutrients(productId: string): Promise<NutrientInfo | null> {
  const map = await loadNutrientsMap();
  const compact = map?.[productId];
  if (!compact) return null;
  const info = compactToNutrientInfo(compact);
  return isNutrientInfoComplete(info) ? info : null;
}

async function resolvePrice(productId: string): Promise<PriceAndWeightInfo | null> {
  const cached = priceByProductId.get(productId);
  if (cached) return cached;
  let pending = inflightPriceFetch.get(productId);
  if (pending) return pending;
  pending = (async () => {
    const details = await fetchProductDetails(productId);
    const priceInfo = details?.priceInfo ?? null;
    if (priceInfo) priceByProductId.set(productId, priceInfo);
    return priceInfo;
  })();
  inflightPriceFetch.set(productId, pending);
  pending.finally(() => inflightPriceFetch.delete(productId));
  return pending;
}

// --- Listing bootstrap (Algolia for search, category API for category pages) ---
type ProductIdMap = Map<string, string>;

function extractThumbnailHash(url: string | null | undefined): string | null {
  return url?.match(/\/images\/([a-f0-9]+)\./)?.[1] ?? null;
}

function ingestProduct(map: ProductIdMap, p: any): void {
  const hash = extractThumbnailHash(p?.thumbnail);
  if (!hash || !p?.id) return;
  const id = String(p.id);
  map.set(hash, id);
  if (p.price_instructions) priceByProductId.set(id, toPriceAndWeightInfo(p.price_instructions));
}

async function fetchSearchIds(query: string): Promise<ProductIdMap> {
  const map: ProductIdMap = new Map();
  const lang = detectLang();
  const url =
    `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/products_prod_${WAREHOUSE}_${lang}/query` +
    `?x-algolia-agent=NutriData&x-algolia-api-key=${ALGOLIA_API_KEY}&x-algolia-application-id=${ALGOLIA_APP_ID}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ query, hitsPerPage: 100 }),
    });
    if (!res.ok) return map;
    const data = await res.json();
    for (const hit of data.hits || []) ingestProduct(map, hit);
  } catch {}
  return map;
}

async function fetchCategoryIds(categoryId: string): Promise<ProductIdMap> {
  const map: ProductIdMap = new Map();
  try {
    const res = await fetch(
      `https://tienda.mercadona.es/api/categories/${categoryId}/?lang=${detectLang()}&wh=${WAREHOUSE}`
    );
    if (!res.ok) return map;
    const walk = (node: any): void => {
      if (!node) return;
      for (const p of node.products || []) ingestProduct(map, p);
      for (const sub of node.categories || []) walk(sub);
    };
    walk(await res.json());
  } catch {}
  return map;
}

type ListingKey = { kind: 'search'; query: string } | { kind: 'category'; id: string };

function currentListingKey(): ListingKey | null {
  const path = window.location.pathname;
  const cat = path.match(/^\/categories\/(\d+)/);
  if (cat) return { kind: 'category', id: cat[1] };
  if (path === '/search-results') {
    const q = new URLSearchParams(window.location.search).get('query');
    if (q) return { kind: 'search', query: q };
  }
  return null;
}

function keyToString(k: ListingKey): string {
  return k.kind === 'search' ? `s:${k.query}` : `c:${k.id}`;
}

let inFlightBootstrap: Promise<ProductIdMap> | null = null;
let currentBootstrapKey: string | null = null;

function bootstrapListing(key: ListingKey): Promise<ProductIdMap> {
  const keyStr = keyToString(key);
  if (currentBootstrapKey === keyStr && inFlightBootstrap) return inFlightBootstrap;
  currentBootstrapKey = keyStr;
  inFlightBootstrap = key.kind === 'search' ? fetchSearchIds(key.query) : fetchCategoryIds(key.id);
  return inFlightBootstrap;
}

function injectLinks(map: ProductIdMap, cards: NodeListOf<HTMLElement>): number {
  let withLinks = 0;
  for (const card of cards) {
    if (card.querySelector(`a.${INJECTED_LINK_CLASS}`)) {
      withLinks += 1;
      continue;
    }
    const hash = extractThumbnailHash(card.querySelector<HTMLImageElement>('img')?.src);
    const productId = hash && map.get(hash);
    if (!productId) continue;
    const a = document.createElement('a');
    a.className = INJECTED_LINK_CLASS;
    a.href = productUrl(productId);
    a.style.display = 'none';
    a.setAttribute('aria-hidden', 'true');
    card.appendChild(a);
    withLinks += 1;
  }
  return withLinks;
}

// Poll URL/cards every 500ms with a 300ms stability window. MutationObserver on
// #root was catastrophic during search-as-you-type — thousands of mutations per
// keystroke. Document-scoped scan handles category pages with multiple sections.
{
  let lastUrl = window.location.href;
  let urlChangedAt = 0;
  let injectedKey: string | null = null;

  const tick = async () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      urlChangedAt = Date.now();
      currentBootstrapKey = null;
      inFlightBootstrap = null;
      injectedKey = null;
      return;
    }
    if (Date.now() - urlChangedAt < 300) return;
    const listing = currentListingKey();
    if (!listing) return;
    const key = keyToString(listing);
    if (injectedKey === key) return;
    const cards = document.querySelectorAll<HTMLElement>('[data-testid="product-cell"]');
    if (cards.length === 0) return;
    const map = await bootstrapListing(listing);
    if (map.size === 0) return;
    if (injectLinks(map, cards) >= cards.length) injectedKey = key;
  };

  const start = () => {
    tick();
    setInterval(tick, 500);
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

function parsePriceFromDom(doc: Document): PriceAndWeightInfo | null {
  // The size aria-label format is "<size> | <X €/kg>" — left side varies (e.g.
  // "Package 4 packs (130 g)") so we only rely on the right side.
  const priceText = doc.querySelector('[data-testid="product-price"]')?.textContent;
  const refPart = doc.querySelector('.product-format__size')?.getAttribute('aria-label')?.split('|')[1];
  const price = parseNumeric(priceText) ?? undefined;
  const pricePerKg = parseNumeric(refPart) ?? undefined;
  if (price === undefined || pricePerKg === undefined) return null;
  return { price, pricePerKg };
}

function extractProductId(doc: Document): string | null {
  const source = doc.documentElement.dataset.sourceUrl ?? window.location.pathname;
  return source.match(PRODUCT_PATH)?.[1] ?? null;
}

export const mercadonaShop: Shop = {
  name: 'MERCADONA',
  getCurrency: () => '€',

  getNutrientInfo: async (doc: Document): Promise<NutrientInfo | null> => {
    const productId = extractProductId(doc);
    return productId ? resolveNutrients(productId) : null;
  },

  getPriceAndWeightInfo: async (doc: Document): Promise<PriceAndWeightInfo> => {
    // Skip DOM parse for the synthetic listing doc (empty body); go straight
    // to the bootstrap-warmed price map.
    if (!doc.documentElement.dataset.sourceUrl) {
      const fromDom = parsePriceFromDom(doc);
      if (fromDom) return fromDom;
    }
    const productId = extractProductId(doc);
    if (!productId) return {};
    return (await resolvePrice(productId)) || {};
  },

  // Mercadona resolves via JSON APIs; return a synthetic doc carrying the URL.
  fetchProductData: async (url: string): Promise<Document> => {
    const doc = new DOMParser().parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.documentElement.dataset.sourceUrl = url;
    return doc;
  },

  getInsertionPoint: (element: HTMLElement): HTMLElement | null =>
    element.querySelector('.private-product-detail__button:last-child'),

  insertMetricsIntoCard: (card: Element, metricsElement: HTMLElement): void => {
    // Unmount any stale .nutri-data-metrics roots before re-inserting; React
    // re-rendering product-cell__info can leave them detached but rooted.
    card.querySelectorAll('.nutri-data-metrics').forEach(removeMetricsElement);
    (card.querySelector('.product-cell__info') || card).appendChild(metricsElement);
  },

  insertSortSelect: (sortSelectElement: HTMLElement, container: HTMLElement): void => {
    container.appendChild(sortSelectElement);
  },

  createCustomSortSelect: (
    onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
  ): React.ReactElement => createCustomSortSelectElement(onSort, 'ml-2', '€'),

  selectors: {
    productList: '.product-container',
    productCard: '[data-testid="product-cell"]',
    adElement: '.nutridata-mercadona-no-ad',
    sortSelect: '.search-results__header, .category-detail__header',
    productLink: `a.${INJECTED_LINK_CLASS}`,
  },
};
