-- A quote pays once. Set when request_purchase claims it.
ALTER TABLE quotes ADD COLUMN used_at TEXT;
