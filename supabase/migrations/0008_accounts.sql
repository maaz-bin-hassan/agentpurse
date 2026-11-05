-- Links a purse owner to a Supabase Auth user. The demo owner keeps a NULL link.
ALTER TABLE owners ADD COLUMN auth_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_auth_user ON owners (auth_user_id);
