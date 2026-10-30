import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS purses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance_cents INTEGER NOT NULL,
  per_txn_cap_cents INTEGER NOT NULL,
  daily_cap_cents INTEGER NOT NULL,
  approval_threshold_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY,
  purse_id TEXT NOT NULL REFERENCES purses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  limit_cents INTEGER NOT NULL,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  purse_id TEXT NOT NULL REFERENCES purses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  allowed_categories TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL,
  trusted INTEGER NOT NULL,
  blocked INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spend_requests (
  id TEXT PRIMARY KEY,
  purse_id TEXT NOT NULL REFERENCES purses(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  envelope_id TEXT,
  raw_text TEXT NOT NULL,
  merchant_name TEXT,
  amount_cents INTEGER,
  currency TEXT,
  category TEXT,
  purpose TEXT,
  confidence REAL,
  decision TEXT,
  decision_reasons TEXT NOT NULL DEFAULT '[]',
  explanation TEXT,
  status TEXT NOT NULL,
  paypal_order_id TEXT,
  capture_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  spend_request_id TEXT NOT NULL REFERENCES spend_requests(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_orders (
  id TEXT PRIMARY KEY,
  purse_id TEXT REFERENCES purses(id) ON DELETE CASCADE,
  spend_request_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  capture_id TEXT,
  custom_id TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  purse_id TEXT REFERENCES purses(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spend_purse ON spend_requests(purse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_spend_envelope ON spend_requests(envelope_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_purse ON audit_events(purse_id, created_at);
`;

export function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
}
