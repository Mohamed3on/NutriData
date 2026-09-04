import { NutrientInfo, PriceAndWeightInfo, Shop, Metrics, CollectPayload } from '../types';
import React from 'react';
import { createCustomSortSelectElement } from '../utils/createCustomSortSelect';
import { isNutrientInfoComplete, parseNumeric } from '../utils';
import {
  mercadonaPackageMassKg,
  mercadonaPricePerKg,
  type MercadonaPriceFields,
} from '../mercadonaPrice';
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
// What /collect wants besides the price. Filled opportunistically from whichever
// API already answered for this product (listing bootstrap or product detail),
// so buildCollectPayload stays synchronous.
type ProductMeta = {
  name: string | null;
  image: string | null;
  gtin: string | null;
  categories: string[] | null;
};
const metaByProductId = new Map<string, ProductMeta>();

// Categories arrive as strings on some endpoints and {name} objects on others,
// and the product API nests the chain under `categories[0].categories`.
function categoryNames(raw: any): string[] | null {
  const out: string[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'string') { out.push(node); return; }
    if (typeof node.name === 'string') out.push(node.name);
    if (node.categories) walk(node.categories);
  };
  walk(raw);
  return out.length ? out.slice(0, 10) : null;
}

function rememberMeta(id: string, meta: Partial<ProductMeta>): void {
  const prev = metaByProductId.get(id);
  metaByProductId.set(id, {
    name: meta.name ?? prev?.name ?? null,
    image: meta.image ?? prev?.image ?? null,
    gtin: meta.gtin ?? prev?.gtin ?? null,
    categories: meta.categories ?? prev?.categories ?? null,
  });
}
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

function toPriceAndWeightInfo(pi: any, name = ''): PriceAndWeightInfo {
  if (!pi) return {};
  const fields: MercadonaPriceFields = {
    price: parseNumeric(pi.unit_price),
    unitSize: parseNumeric(pi.unit_size),
    sizeFormat: pi.size_format,
    referenceFormat: pi.reference_format,
    referencePrice: parseNumeric(pi.reference_price),
    name,
  };
  const massKg = mercadonaPackageMassKg(fields);
  return {
    price: fields.price ?? undefined,
    // callers expect grams, and unit_size is in kg/L or is a piece count
    weight: massKg ? massKg * 1000 : undefined,
    pricePerKg: mercadonaPricePerKg(fields) ?? undefined,
  };
}

async function fetchProductDetails(productId: string): Promise<{ ean: string | null; priceInfo: PriceAndWeightInfo } | null> {
  const r = await fetch(`https://tienda.mercadona.es/api/products/${productId}/`);
  if (!r.ok) return null;
  const data = await r.json();
  rememberMeta(productId, {
    name: data?.display_name || null,
    image: data?.photos?.[0]?.regular || data?.thumbnail || null,
    gtin: data?.ean || null,
    categories: categoryNames(data?.categories),
  });
  return {
    ean: data?.ean || null,
    priceInfo: toPriceAndWeightInfo(data?.price_instructions, data?.display_name || ''),
  };
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
  rememberMeta(id, {
    name: p.display_name || null,
    image: p.thumbnail || null,
    gtin: p.ean || null,
    categories: categoryNames(p.categories),
  });
  if (p.price_instructions)
    priceByProductId.set(id, toPriceAndWeightInfo(p.price_instructions, p.display_name || ''));
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

function parsePriceFromDom(root: ParentNode): PriceAndWeightInfo | null {
  // The size aria-label format is "<size> | <X €/kg>" — left side varies (e.g.
  // "Package 4 packs (130 g)") so we only rely on the right side.
  const priceText = root.querySelector('[data-testid="product-price"]')?.textContent;
  const refPart = root.querySelector('.product-format__size')?.getAttribute('aria-label')?.split('|')[1];
  const price = parseNumeric(priceText) ?? undefined;
  const pricePerKg = parseNumeric(refPart) ?? undefined;
  if (price === undefined || pricePerKg === undefined) return null;
  return { price, pricePerKg };
}

// Mercadona stacks detail panels: the open product modal sits on top of the
// underlying full-page detail, both with `.private-product-detail`. Without
// scoping, `querySelector` picks the first in DOM order, which mixes the
// modal's price with the underlying page's product. Prefer the topmost modal
// detail, fall back to the full-page detail.
function activeDetailRoot(doc: Document | Element): Element | null {
  const modalDetails = doc.querySelectorAll('.modal-content .private-product-detail');
  return modalDetails[modalDetails.length - 1] ?? doc.querySelector('.private-product-detail');
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
      const root = activeDetailRoot(doc);
      const fromDom = root ? parsePriceFromDom(root) : null;
      if (fromDom) return fromDom;
    }
    const productId = extractProductId(doc);
    if (!productId) return {};
    return (await resolvePrice(productId)) || {};
  },

  // Contribute price to the shared index. Nutrition for Mercadona comes from the
  // bundled OCR dump rather than the page, so it adds nothing the server hasn't
  // got — the value here is the price, which is the half that actually drifts.
  // Everything is read from caches the just-completed getPriceAndWeightInfo call
  // already warmed, keeping this synchronous.
  buildCollectPayload(doc: Document, nutrientInfo: NutrientInfo): CollectPayload | null {
    const id = extractProductId(doc);
    if (!id) return null;
    const root = doc.documentElement.dataset.sourceUrl ? null : activeDetailRoot(doc);
    const price = priceByProductId.get(id) ?? (root ? parsePriceFromDom(root) : null);
    if (!price?.price) return null; // no price is nothing worth sending
    const meta = metaByProductId.get(id);
    return {
      shop: 'mercadona',
      shop_id: id,
      name: meta?.name ?? null,
      url: productUrl(id),
      image_url: meta?.image ?? null,
      categories: meta?.categories ?? null,
      price: price.price ?? null,
      price_per_unit: price.pricePerKg ?? null,
      unit: null,
      brand: null,
      gtin: meta?.gtin ?? null,
      nutritional_data: nutrientInfo,
    };
  },

  // Mercadona resolves via JSON APIs; return a synthetic doc carrying the URL.
  fetchProductData: async (url: string): Promise<Document> => {
    const doc = new DOMParser().parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.documentElement.dataset.sourceUrl = url;
    return doc;
  },

  getInsertionPoint: (element: HTMLElement): HTMLElement | null =>
    activeDetailRoot(element)?.querySelector<HTMLElement>('.private-product-detail__button:last-child') ?? null,

  getContentSignature: (doc: Document): string => {
    const h1 = activeDetailRoot(doc)?.querySelector('h1')?.textContent?.trim() ?? '';
    return `${window.location.href}|${h1}`;
  },

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
