-- AgentPurse does not hold money. Allowances are ledger caps.
-- PayPal charges a vaulted wallet and pays the merchant.

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  panic_frozen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  setup_token_id TEXT,
  payment_token_id TEXT,
  paypal_customer_id TEXT,
  payer_email TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  api_key_prefix TEXT NOT NULL,
  allowance_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  allowed_categories TEXT NOT NULL,
  per_txn_cap_cents INTEGER NOT NULL,
  daily_cap_cents INTEGER NOT NULL,
  approval_threshold_cents INTEGER NOT NULL,
  trusted_merchants_only INTEGER NOT NULL DEFAULT 0,
  policy_text TEXT,
  policy_source TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  trusted INTEGER NOT NULL,
  blocked INTEGER NOT NULL,
  paypal_email TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  original_task TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  page_excerpt TEXT,
  merchant_name TEXT,
  merchant_email TEXT,
  amount_cents INTEGER,
  currency TEXT,
  category TEXT,
  purpose TEXT,
  confidence REAL,
  guard_decision TEXT,
  guard_reasons TEXT NOT NULL DEFAULT '[]',
  decision TEXT,
  decision_reasons TEXT NOT NULL DEFAULT '[]',
  explanation TEXT,
  status TEXT NOT NULL,
  paypal_order_id TEXT,
  capture_id TEXT,
  approval_method TEXT,
  quote_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  method TEXT,
  note TEXT,
  webauthn_verified INTEGER NOT NULL DEFAULT 0,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  paypal_order_id TEXT,
  capture_id TEXT,
  refund_id TEXT,
  custom_id TEXT NOT NULL,
  webhook_event_id TEXT,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_orders (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  intent_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  capture_id TEXT,
  vault_id TEXT,
  payee_email TEXT,
  custom_id TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_events (
  id TEXT PRIMARY KEY,
  transmission_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  intent_id TEXT,
  verified INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_setup_tokens (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_payment_tokens (
  id TEXT PRIMARY KEY,
  setup_token_id TEXT,
  customer_id TEXT,
  payer_email TEXT,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_email TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  description TEXT NOT NULL,
  original_task TEXT NOT NULL,
  page_excerpt TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  intent_id TEXT,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  intent_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  secret_hash TEXT,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  client_id TEXT,
  owner_id TEXT NOT NULL,
  agent_id TEXT,
  scope TEXT NOT NULL,
  expires_at TEXT,
  refresh_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_intents_agent ON intents (agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_agent ON receipts (agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_events (owner_id, created_at);
