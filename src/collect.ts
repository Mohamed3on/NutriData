import { Shop, NutrientInfo, CollectPayload } from './types';

// Crowd-source product updates to the protein-index dataset. When the extension
// parses a product the user is viewing, it contributes a snapshot so the public
// index stays fresh (esp. prices). Only product data is sent — no user
// identifiers. Shops without `buildCollectPayload` (Mercadona, Amazon) are
// skipped.
//
// Performance: on category/search pages the extension parses many products in a
// burst. Rather than a POST + two chrome.storage ops per product, we load the
// dedup map once, queue payloads, and flush them in one batched request (the
// /collect endpoint accepts arrays). sendBeacon makes the flush survive
// navigation away from the page.
const ENDPOINT = 'https://protein-index.mohamed3on.com/collect';
const STORE_KEY = 'nd_collected';
const TTL_MS = 6 * 24 * 60 * 60 * 1000; // re-send a given product at most ~weekly
const MAX_KEYS = 8000;
const BATCH = 50;        // endpoint cap per request
const FLUSH_MS = 1500;   // debounce a burst of cards into one request

type SentMap = Record<string, number>;

let sentMap: SentMap | null = null; // dedup map, loaded once per page
const queue: CollectPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;
let unloadBound = false;

async function ensureLoaded(): Promise<SentMap> {
  if (!sentMap) {
    try {
      sentMap = ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as SentMap) || {};
    } catch {
      sentMap = {};
    }
    if (!unloadBound) {
      unloadBound = true;
      // Flush whatever's buffered before the page goes away.
      addEventListener('pagehide', () => flush(), { capture: true });
      addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
  }
  return sentMap;
}

function send(batch: CollectPayload[]): void {
  const body = JSON.stringify(batch);
  try {
    // text/plain dodges a CORS preflight; sendBeacon survives unload.
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
  } catch { /* fall through */ }
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true }).catch(() => {});
}

function flush(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
  if (!queue.length) return;
  send(queue.splice(0, BATCH));
  if (sentMap) {
    // Persist the (pruned) dedup map once per flush, not once per product.
    const now = Date.now();
    const fresh = Object.entries(sentMap)
      .filter(([, ts]) => now - ts < TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_KEYS);
    sentMap = Object.fromEntries(fresh);
    chrome.storage.local.set({ [STORE_KEY]: sentMap }).catch(() => {});
  }
  if (queue.length) scheduleFlush(); // >BATCH queued — send the rest next tick
}

function scheduleFlush(): void {
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

export async function maybeCollect(shop: Shop, doc: Document, nutrientInfo: NutrientInfo): Promise<void> {
  try {
    if (!shop.buildCollectPayload) return;
    const payload = shop.buildCollectPayload(doc, nutrientInfo);
    if (!payload?.shop_id) return;
    const map = await ensureLoaded();
    const key = `${payload.shop}:${payload.shop_id}`;
    const now = Date.now();
    if (map[key] && now - map[key] < TTL_MS) return; // sent recently — skip
    map[key] = now; // mark optimistically so a re-render in the same burst doesn't re-queue
    queue.push(payload);
    scheduleFlush();
  } catch {
    // Collection must never interfere with rendering the nutrition card.
  }
}
