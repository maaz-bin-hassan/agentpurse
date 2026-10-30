# Deploy

The demo runs locally on SQLite with `PAYPAL_MODE=mock`. A public deploy should use Supabase Postgres so serverless instances share one database. PayPal webhooks need a public HTTPS URL.

## Database migrations

Migrations live in `supabase/migrations` and run in filename order:

1. `0001_agentpurse.sql` is a no-op (`SELECT 1`). The first prototype's held-balance tables were never deployed.
2. `0002_agentic_commerce.sql` creates the ledger schema: owners, vaults, agents, merchants, intents, approvals, receipts, PayPal orders and events, mock vault tokens, audit, quotes, WebAuthn, push, notifications, and OAuth.

`npm run db:migrate` applies any file that is not already recorded in `schema_migrations`. It uses `CREATE TABLE IF NOT EXISTS` and does not drop tables or delete rows. A second run records nothing new.

`npm run db:seed` applies those migrations, then inserts Maya Chen's household only where the demo rows are missing. It does not delete existing rows. The in-app Reset demo button still replaces Maya's sample rows on purpose; this script does not.

Both commands read `DATABASE_URL` when it is set and otherwise use the local SQLite file (`AGENTPURSE_DB`, or `data/agentpurse.db`). They print the dialect, never the connection string.

```bash
export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'
npm run db:migrate
npm run db:seed
```

Keep the password in the environment or the host's secret store. Do not commit it.

The Agentpurse Supabase project is in West EU (`eu-west-1`), project ref `gceiiwswdypfakounlka`, API URL `https://gceiiwswdypfakounlka.supabase.co`. Use that project's transaction pooler URI (port `6543`) as `DATABASE_URL`. The direct host is `db.gceiiwswdypfakounlka.supabase.co` on port `5432`.

## Supabase (free tier)

1. Open the Agentpurse project, or create one at https://supabase.com.
2. Put the pooler URI in `DATABASE_URL` and run `npm run db:migrate`, then `npm run db:seed`. The SQL editor can run the same files in order if you prefer; `0001` is safe to run and `0002` only creates missing tables.
3. Leave `schema_migrations` in place so a later `npm run db:migrate` does not try to treat an applied file as new work. Re-running the files by hand is still safe because every create is `IF NOT EXISTS`.

## One command

From this directory, after `npm install`:

```bash
npx vercel
```

Accept the defaults. Then set the environment variables below in the Vercel project and run `npx vercel --prod`. The app boots in mock mode with no secrets. The first request seeds Maya if `AGENTPURSE_AUTO_SEED` is not `0`.

Render is the other free option: the included `render.yaml` is the blueprint. Create the service from that file, set `DATABASE_URL`, and deploy.

## Vercel (free tier)

1. `npx vercel` as above, or import the GitHub repository. Framework preset is Next.js.
2. Set environment variables from `.env.example`. At minimum for a public mock demo:

```
PAYPAL_MODE=mock
AI_MODE=mock
DATABASE_URL=postgresql://...
PUBLIC_BASE_URL=https://<your-app>.vercel.app
AGENTPURSE_AUTO_SEED=1
```

3. Deploy. Open `https://<your-app>.vercel.app/purses/purse_maya`.

SQLite on Vercel does not persist. Do not deploy the mock demo without `DATABASE_URL`.

For a real sandbox, also set `PAYPAL_MODE=live`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_EMAIL` (the sandbox business account that receives charges), and `PAYPAL_WEBHOOK_ID`. Point a PayPal sandbox webhook at `https://<your-app>.vercel.app/api/paypal/webhooks` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`, and `VAULT.PAYMENT-TOKEN.DELETED`.

## Render (free tier)

`render.yaml` starts `npm run start` after `npm run build`. Set the same environment variables in the Render dashboard. The free web service sleeps when idle; the first request after sleep is slow, and PayPal webhook retries cover that.

## After deploy

Replace the URL in `plugin/agentpurse/.mcp.json` with `https://<your-app>.vercel.app/mcp` before registering the Grok Bot plugin. See `docs/PLUGIN.md`.
