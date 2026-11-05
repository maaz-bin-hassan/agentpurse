# Deploy

The demo runs locally on SQLite with `PAYPAL_MODE=mock`. A public deploy should use Supabase Postgres so serverless instances share one database. PayPal webhooks need a public HTTPS URL.

## Database migrations

Migrations live in `supabase/migrations` and run in filename order:

1. `0001_agentpurse.sql` is a no-op (`SELECT 1`). The first prototype's held-balance tables were never deployed.
2. `0002_agentic_commerce.sql` creates the ledger schema: owners, vaults, agents, merchants, intents, approvals, receipts, PayPal orders and events, mock vault tokens, audit, quotes, WebAuthn, push, notifications, and OAuth.

`npm run db:migrate` applies any file that is not already recorded in `schema_migrations`. It uses `CREATE TABLE IF NOT EXISTS` and does not drop tables or delete rows. A second run records nothing new.

`npm run db:seed` applies those migrations, then inserts Maaz Hassan's household only where the demo rows are missing. It does not delete existing rows. The in-app Reset demo button still replaces Maaz's sample rows on purpose; this script does not.

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

## Accounts (Supabase Auth)

Real users sign up with email and password. The app uses Supabase for auth only; data still goes through `DATABASE_URL`.

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel (Production and Preview). The publishable key is safe in the browser.
2. Supabase dashboard → Authentication → URL Configuration: Site URL `https://agentpurse.vercel.app`, and add `https://agentpurse.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs. Add preview URLs with a wildcard if you test previews.
3. Authentication → Providers → Email: keep Confirm email on. Set a custom SMTP sender before launch; the built-in one sends only a few emails an hour.
4. Migration `0008_accounts.sql` adds `owners.auth_user_id`. It runs on boot like the others and does not touch the demo rows.

5. Branded emails: Supabase lets you edit templates only after custom SMTP is set. Under Authentication → Emails → SMTP Settings, add a sender (Resend's free tier works: verify a domain, then host `smtp.resend.com`, port `465`, user `resend`, password your Resend API key, sender like `AgentPurse <hello@yourdomain>`). Then paste `supabase/templates/confirm-signup.html` into **Confirm sign up** (subject: "Confirm your AgentPurse email") and `supabase/templates/reset-password.html` into **Reset password** (subject: "Reset your AgentPurse password"). Both use `{{ .ConfirmationURL }}` and `{{ .Email }}`.

Without those two variables the site stays demo-only and `/login` says accounts are off.

## One command

From this directory, after `npm install`:

```bash
npx vercel
```

Accept the defaults. Then set the environment variables below in the Vercel project and run `npx vercel --prod`. The app boots in mock mode with no secrets. The first request seeds Maaz if `AGENTPURSE_AUTO_SEED` is not `0`.

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

3. Deploy. Open `https://<your-app>.vercel.app/purses/purse_maaz`.

SQLite on Vercel does not persist. Do not deploy the mock demo without `DATABASE_URL`.

For a real sandbox, also set `PAYPAL_MODE=live`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_EMAIL` (the sandbox business account that receives charges), and `PAYPAL_WEBHOOK_ID`. Point a PayPal sandbox webhook at `https://<your-app>.vercel.app/api/paypal/webhooks` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`, and `VAULT.PAYMENT-TOKEN.DELETED`.

## PayPal sandbox demo

Mock stays the default. This turns the public site into a real sandbox demo. Keep every value in the host's env, never in the repo or in chat.

1. At developer.paypal.com, under Sandbox accounts, make a US **business** account and a US **personal** account.
2. Under Apps & Credentials, in Sandbox, create a REST app **under that business account**. Refunds depend on the payee being the app's own account.
3. In the app's features, turn on **Vault** for PayPal wallets.
4. Add a webhook to the app for `https://agentpurse.vercel.app/api/paypal/webhooks` with `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `VAULT.PAYMENT-TOKEN.DELETED`.
5. Set these in Vercel, then redeploy:

```
PAYPAL_MODE=live
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_MERCHANT_EMAIL=<the sandbox business account email>
AGENTPURSE_SANDBOX_DEMO=1
DEMO_SESSION_SECRET=<a long random string>
PUBLIC_BASE_URL=https://agentpurse.vercel.app
```

`GET /api/health` must show `"sandboxDemo": true`. The app refuses this mode on any host other than the sandbox.

Then run this once on the public URL:

1. Open Controls and click **Reset demo**. This drops the old mock wallet.
2. Click **Link PayPal** and log in as the sandbox personal account.
3. Ask Grocer for oat milk. It should pay on its own.
4. Hold a $75 Metro Rail seat, then click **Approve and pay**.
5. Check the payment in the sandbox business account.
6. Refund it from Approvals.

Anyone with the link can use this demo, because it is sandbox money. A visitor can click **Revoke PayPal**, and then you link the wallet again. Check it before recording or submitting.

Real live mode (`PAYPAL_MODE=live` without the sandbox demo) has no dashboard sign-in yet, so do not use it.

## Channel3

Mock data is the default, and its shops are fictional `.example` domains. To use the real catalog:

1. Create a key at https://trychannel3.com. The free tier is 1,000 credits a month.
2. Set `CHANNEL3_MODE=live` and `CHANNEL3_API_KEY` in the host's env.
3. In the Channel3 dashboard, add the webhook endpoint `https://agentpurse.vercel.app/api/channel3/webhooks`.
4. Copy its `whsec_` secret to `CHANNEL3_WEBHOOK_SECRET`, then redeploy.

`GET /api/health` must show `"channel3Mode": "live"` and `"channel3Configured": true`. Click **Reset demo** once after this deploy, because Handy gained the `shopping` category.

With live data, **Simulate price drop** goes away. Use **Check now**, or wait for a real webhook.

## Render (free tier)

`render.yaml` starts `npm run start` after `npm run build`. Set the same environment variables in the Render dashboard. The free web service sleeps when idle; the first request after sleep is slow, and PayPal webhook retries cover that.

## After deploy

Replace the URL in `plugin/agentpurse/.mcp.json` with `https://<your-app>.vercel.app/mcp` before registering the Grok Bot plugin. See `docs/PLUGIN.md`.
