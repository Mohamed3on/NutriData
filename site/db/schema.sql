-- Canonical product store for the protein-index site, kept fresh by the
-- NutriData extension via POST /collect. One row per (shop, shop_id).
--
-- nutritional_data is the same object-with-units shape REWE serves and the
-- extension parses, e.g. {"protein":"25 g","calories":"589 kcal","fat":"46 g"}.
-- categories is a JSON array string, e.g. ["Käse, Eier & Molkerei","Käse"].
CREATE TABLE IF NOT EXISTS product (
  shop             TEXT NOT NULL,
  shop_id          TEXT NOT NULL,
  name             TEXT,
  url              TEXT,
  image_url        TEXT,
  categories       TEXT,
  price            REAL,
  price_per_unit   REAL,   -- REWE Grundpreis (€/kg or €/L); drives protein-per-€
  unit             TEXT,
  brand            TEXT,
  gtin             TEXT,
  nutritional_data TEXT,
  gone_at          TEXT,   -- delisted: see below
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (shop, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_product_shop ON product (shop);
-- The Worker's rewe.json version: the newest REWE write.
CREATE INDEX IF NOT EXISTS idx_product_updated ON product (shop, updated_at);

-- product.gone_at marks a delisted product: set when the extension sees its
-- page 404, cleared by the next /collect of it. The site export skips flagged
-- rows. (Live DBs got it via ALTER TABLE product ADD COLUMN gone_at TEXT.)

-- REWE stocks per market: whether a product can be ordered at the market the
-- sender has selected (REWE's metaData.marketCode). Lets the site hide products
-- a given market can't sell.
CREATE TABLE IF NOT EXISTS availability (
  shop       TEXT NOT NULL,
  shop_id    TEXT NOT NULL,
  market     TEXT NOT NULL,
  buyable    INTEGER NOT NULL,  -- 1 = orderable at that market, 0 = not
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (shop, shop_id, market)
);
