-- Catalog purchases and price watches. The purchase columns stay empty for merchant payments.
ALTER TABLE quotes ADD COLUMN product_id TEXT;
ALTER TABLE quotes ADD COLUMN offer_url TEXT;

ALTER TABLE intents ADD COLUMN product_id TEXT;
ALTER TABLE intents ADD COLUMN product_title TEXT;
ALTER TABLE intents ADD COLUMN offer_url TEXT;
ALTER TABLE intents ADD COLUMN image_url TEXT;
ALTER TABLE intents ADD COLUMN price_note TEXT;

CREATE TABLE IF NOT EXISTS price_watches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  start_cents INTEGER NOT NULL,
  original_task TEXT NOT NULL,
  subscription_id TEXT,
  status TEXT NOT NULL,
  intent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watch_subscription ON price_watches (subscription_id);

CREATE TABLE IF NOT EXISTS channel3_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_catalog_prices (
  product_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  PRIMARY KEY (product_id, domain)
);
