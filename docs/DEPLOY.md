# Deploy

The demo runs locally on SQLite with `PAYPAL_MODE=mock`. A public deploy should use Supabase Postgres so serverless instances share one database. PayPal webhooks need a public HTTPS URL.

## Supabase (free tier)

1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/0002_agentic_commerce.sql`. `0001` is a no-op.
3. Copy the transaction pooler URI (port `6543`) into `DATABASE_URL`.

## Vercel (free tier)

1. Import the GitHub repository. Framework preset is Next.js.
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
