-- Hosted twin of the SQLite schema in src/db/schema.ts.
-- The demo app does not connect here. Apply this in a Supabase project
-- when you want a hosted copy of the same purse, envelope, and ledger model.
-- The running app keeps using SQLite until a future adapter reads this database.

create table if not exists purses (
  id text primary key,
  name text not null,
  owner_name text not null,
  currency text not null,
  balance_cents integer not null,
  per_txn_cap_cents integer not null,
  daily_cap_cents integer not null,
  approval_threshold_cents integer not null,
  created_at timestamptz not null
);

create table if not exists envelopes (
  id text primary key,
  purse_id text not null references purses (id) on delete cascade,
  name text not null,
  category text not null,
  limit_cents integer not null,
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  created_at timestamptz not null
);

create table if not exists agents (
  id text primary key,
  purse_id text not null references purses (id) on delete cascade,
  name text not null,
  description text not null,
  allowed_categories text not null,
  status text not null check (status in ('active', 'paused')),
  created_at timestamptz not null
);

create table if not exists merchants (
  id text primary key,
  name text not null unique,
  category text not null,
  trusted boolean not null,
  blocked boolean not null
);

create table if not exists spend_requests (
  id text primary key,
  purse_id text not null references purses (id) on delete cascade,
  agent_id text not null,
  envelope_id text,
  raw_text text not null,
  merchant_name text,
  amount_cents integer,
  currency text,
  category text,
  purpose text,
  confidence double precision,
  decision text,
  decision_reasons jsonb not null default '[]'::jsonb,
  explanation text,
  status text not null,
  paypal_order_id text,
  capture_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists approvals (
  id text primary key,
  spend_request_id text not null references spend_requests (id) on delete cascade,
  decision text not null,
  note text,
  decided_at timestamptz,
  created_at timestamptz not null
);

create table if not exists paypal_orders (
  id text primary key,
  purse_id text references purses (id) on delete cascade,
  spend_request_id text,
  kind text not null,
  status text not null,
  currency text not null,
  amount_cents integer not null,
  capture_id text,
  custom_id text,
  raw_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists audit_events (
  id text primary key,
  purse_id text references purses (id) on delete cascade,
  actor text not null,
  action text not null,
  detail text not null,
  created_at timestamptz not null
);
