import { Shop, NutrientInfo } from './types';

// Crowd-source product updates to the protein-index dataset. When the
// extension parses a product the user is viewing, it fire-and-forget POSTs a
// snapshot so the public index stays fresh (esp. prices). Only product data is
// sent — no user identifiers. Shops without `buildCollectPayload` (Mercadona,
// Amazon) are skipped.
const ENDPOINT = 'https://protein-index.mohamed3on.com/collect';
const STORE_KEY = 'nd_collected';
const TTL_MS = 6 * 24 * 60 * 60 * 1000; // re-send a given product at most ~weekly
const MAX_KEYS = 5000;

type SentMap = Record<string, number>;

export async function maybeCollect(
  shop: Shop,
  doc: Document,
  nutrientInfo: NutrientInfo
): Promise<void> {
  try {
    if (!shop.buildCollectPayload) return;
    const payload = shop.buildCollectPayload(doc, nutrientInfo);
    if (!payload?.shop_id) return;

    const key = `${payload.shop}:${payload.shop_id}`;
    const now = Date.now();
    const sent: SentMap = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] || {};
    if (sent[key] && now - sent[key] < TTL_MS) return; // sent recently — skip

    // text/plain dodges a CORS preflight; the Worker parses the body as JSON.
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});

    sent[key] = now;
    // Prune expired entries, then cap to the most-recent MAX_KEYS.
    const fresh = Object.entries(sent)
      .filter(([, ts]) => now - ts < TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_KEYS);
    await chrome.storage.local.set({ [STORE_KEY]: Object.fromEntries(fresh) });
  } catch {
    // Collection must never interfere with rendering the nutrition card.
  }
}
