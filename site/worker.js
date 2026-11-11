// Protein-index Worker: serves the static site, builds rewe.json live from D1,
// and accepts crowd-sourced product updates from the NutriData extension at
// POST /collect.
//
// run_worker_first is on, so every request lands here first: the old host has
// to redirect even paths that match an asset. Assets ({store}.html served at
// /{store}, {store}.json) go through env.ASSETS at the end.

// The REWE card code (scoring, ranking, category table), shared with the site
// build.
import { reweStore, REWE_SQL } from '../scripts/lib/rewe-card.ts';

const OLD_HOST = 'protein-index.mohamed3on.com';
const NEW_HOST = 'nutridata.mohamed3on.com';
const STORES = ['rewe', 'mercadona'];

const SHOPS = new Set(['rewe', 'mercadona', 'amazon']);
const NUTRIENT_KEYS = ['protein', 'calories', 'fat', 'saturatedFat', 'carbs', 'sugar', 'fiber', 'salt'];

// Reject physically-impossible per-100g nutrition at ingestion so D1 never
// stores it (mirrors the site-build Atwater gate; keeps a bad first reading
// from being frozen in). Returns true when the data is plausible or too sparse
// to judge.
const toNum = (s) => { if (s == null) return null; const m = String(s).match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null; };
function nutritionSane(obj) {
  const protein = toNum(obj.protein);
  let calories = toNum(obj.calories);
  if (calories != null && /kj/i.test(String(obj.calories)) && !/kcal/i.test(String(obj.calories))) calories /= 4.184;
  if (protein == null || calories == null) return true; // too little to judge
  if (protein < 0 || protein > 100 || calories <= 0 || calories > 950) return false;
  if ((protein * 100) / calories > 27) return false; // protein is 4 kcal/g → ≤25 g per 100 kcal
  const est = 4 * protein + 4 * (toNum(obj.carbs) || 0) + 9 * (toNum(obj.fat) || 0);
  return est <= calories * 2 + 10 && calories <= est * 3 + 100;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Validate + normalise an incoming product. Returns a clean row or null.
function clean(p) {
  if (!p || typeof p !== 'object') return null;
  if (!SHOPS.has(p.shop)) return null;
  const shop_id = String(p.shop_id ?? '').trim();
  if (!shop_id || shop_id.length > 64) return null;
  // The extension saw this product's page 404: REWE delisted it.
  if (p.gone === true) return { shop: p.shop, shop_id, gone: true };

  const str = (v, max) => (v == null ? null : String(v).slice(0, max));
  const https = (v) => (/^https:\/\//.test(String(v ?? '')) ? str(v, 500) : null); // no javascript: links
  const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return isFinite(n) ? n : null; };

  let categories = null;
  if (Array.isArray(p.categories)) {
    const c = p.categories.filter((x) => typeof x === 'string' && x).slice(0, 10);
    if (c.length) categories = JSON.stringify(c);
  }

  let nutritional_data = null;
  let nutrition_full = 0;
  if (p.nutritional_data && typeof p.nutritional_data === 'object') {
    const obj = {};
    for (const k of NUTRIENT_KEYS) {
      const v = p.nutritional_data[k];
      if (v != null && String(v).trim()) obj[k] = String(v).slice(0, 24);
    }
    if (Object.keys(obj).length && nutritionSane(obj)) {
      nutritional_data = JSON.stringify(obj);
      // protein+calories means this came from the page's own Nährwerte table
      // rather than a fragment, so it is authoritative for the whole product.
      nutrition_full = obj.protein && obj.calories ? 1 : 0;
    }
  }

  const price = num(p.price);
  // Reject empty submissions (nothing worth storing / refreshing).
  if (!nutritional_data && price == null) return null;

  return {
    shop: p.shop, shop_id,
    name: str(p.name, 300), url: https(p.url), image_url: https(p.image_url),
    categories, price, price_per_unit: num(p.price_per_unit),
    unit: str(p.unit, 32), brand: str(p.brand, 120), gtin: str(p.gtin, 32),
    nutritional_data, nutrition_full,
    // Availability at the sender's selected market (REWE stocks per market).
    market: /^\d{1,12}$/.test(String(p.market ?? '')) ? String(p.market) : null,
    buyable: typeof p.buyable === 'boolean' ? +p.buyable : null,
  };
}

// Last-write-wins on price/name/etc (they drift). Nutrition too, but only from
// an authoritative reading — one carrying both protein and calories, which means
// the extension parsed the page own structured Nährwerte table rather than a
// fragment. That replaces the stored row outright, so a reformulation or a bad
// seed can be corrected and a nutrient the product does not actually list can be
// dropped. Anything less complete only fills in a row that has no nutrition yet.
const UPSERT = `
INSERT INTO product (shop, shop_id, name, url, image_url, categories, price, price_per_unit, unit, brand, gtin, nutritional_data, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))
ON CONFLICT(shop, shop_id) DO UPDATE SET
  name           = COALESCE(excluded.name, product.name),
  url            = COALESCE(excluded.url, product.url),
  image_url      = COALESCE(excluded.image_url, product.image_url),
  categories     = COALESCE(excluded.categories, product.categories),
  price          = COALESCE(excluded.price, product.price),
  price_per_unit = COALESCE(excluded.price_per_unit, product.price_per_unit),
  unit           = COALESCE(excluded.unit, product.unit),
  brand          = COALESCE(excluded.brand, product.brand),
  gtin           = COALESCE(product.gtin, excluded.gtin),
  nutritional_data = CASE
    WHEN ?13 = 1 THEN excluded.nutritional_data
    ELSE COALESCE(product.nutritional_data, excluded.nutritional_data) END,
  gone_at        = NULL,
  updated_at     = datetime('now');`;

// Soft delete: the export skips flagged rows, and the next sighting of the
// product (UPSERT above) clears the flag, so a bogus report undoes itself.
// Bumps updated_at so rewe.json is rebuilt without the product.
const GONE = `UPDATE product SET gone_at = datetime('now'), updated_at = datetime('now') WHERE shop = ?1 AND shop_id = ?2`;

const AVAILABILITY = `
INSERT INTO availability (shop, shop_id, market, buyable) VALUES (?1, ?2, ?3, ?4)
ON CONFLICT(shop, shop_id, market) DO UPDATE SET buyable = excluded.buyable, updated_at = datetime('now');`;

// rewe.json, built from D1 so a price the extension collects shows on the next
// page load. It is versioned by the newest write and the deploy: a browser
// revalidates to a 304, and each data centre rebuilds only after a change.
async function reweJson(request, env, ctx) {
  const latest = await env.DB.prepare("SELECT max(updated_at) AS v FROM product WHERE shop = 'rewe'").first('v');
  const etag = `"${env.VERSION.id}/${latest}"`;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
  // Compression makes the edge send the ETag weak (W/), and browsers echo that back.
  if (request.headers.get('If-None-Match')?.replace(/^W\//, '') === etag) return new Response(null, { status: 304, headers });
  // The key carries the version, so a cached copy never goes stale.
  const key = new Request(new URL('/rewe.json?v=' + encodeURIComponent(etag), request.url));
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { headers });
  const { results } = await env.DB.prepare(REWE_SQL).all();
  const body = JSON.stringify(reweStore(results));
  ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { ...headers, 'Cache-Control': 'public, max-age=86400' } })));
  return new Response(body, { headers });
}

async function collect(request, env) {
  if ((request.headers.get('content-length') | 0) > 32768) return json({ error: 'too_large' }, 413);

  // Light abuse guard (no-op if the binding isn't configured).
  if (env.COLLECT_RATE_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') || 'anon';
    const { success } = await env.COLLECT_RATE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'rate_limited' }, 429);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  // Accept a single product or a small batch.
  const items = (Array.isArray(body) ? body : [body]).slice(0, 50).map(clean).filter(Boolean);
  if (!items.length) return json({ error: 'no_valid_items' }, 400);

  const stmt = env.DB.prepare(UPSERT);
  const gone = env.DB.prepare(GONE);
  const avail = env.DB.prepare(AVAILABILITY);
  await env.DB.batch(items.flatMap((r) => {
    if (r.gone) return [gone.bind(r.shop, r.shop_id)];
    const out = [stmt.bind(
      r.shop, r.shop_id, r.name, r.url, r.image_url, r.categories,
      r.price, r.price_per_unit, r.unit, r.brand, r.gtin, r.nutritional_data,
      r.nutrition_full,
    )];
    if (r.market && r.buyable != null) out.push(avail.bind(r.shop, r.shop_id, r.market, r.buyable));
    return out;
  }));

  return json({ ok: true, accepted: items.length });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    // Live, so a product the extension just saw as unbuyable leaves the index
    // at the next page load instead of the next hourly rebuild.
    if (pathname === '/unbuyable') {
      const market = new URL(request.url).searchParams.get('market') || '';
      if (!/^\d{1,12}$/.test(market)) return json([]);
      const { results } = await env.DB.prepare(
        "SELECT shop_id FROM availability WHERE shop = 'rewe' AND market = ?1 AND buyable = 0",
      ).bind(market).all();
      return json(results.map((r) => r.shop_id));
    }
    if (pathname === '/collect') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return collect(request, env);
      return json({ error: 'method_not_allowed' }, 405);
    }
    // The site moved from protein-index.* to nutridata.*. The old host keeps
    // /collect and /unbuyable above (shipped extensions POST there); every page
    // view is sent to the new host.
    const url = new URL(request.url);
    if (url.hostname === OLD_HOST) {
      url.hostname = NEW_HOST;
      return Response.redirect(url, 301);
    }
    // One page per store at /{store}; / goes to the store a legacy ?store= named.
    if (pathname === '/') {
      const s = url.searchParams.get('store');
      url.searchParams.delete('store');
      url.pathname = '/' + (STORES.includes(s) ? s : 'rewe');
      return Response.redirect(url, 302);
    }
    if (pathname === '/rewe.json') return reweJson(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
