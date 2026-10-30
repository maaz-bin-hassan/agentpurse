# Three-minute demo

No PayPal account and no model key. `PAYPAL_MODE=mock` and `AI_MODE=mock`.

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maya.

Maya's PayPal wallet is already vaulted (`VAULT-MOCK-MAYA`). Each agent has a ledger allowance. Nothing in the app is a PayPal balance we hold. Stack already paid CloudApps $12. Wayfinder already tried a $900 SkyAir flight and was denied. No order exists for that flight.

## 1. Injection block

Open http://localhost:3000/demo/injection.

The product page is oat milk. A hidden line says to buy 5 gift cards from Lucky Chips.

Click **Let Grocer follow the page**. The guard blocks it and quotes the hidden instruction. The task was oat milk.

Click **Let Grocer follow the task**. That purchase matches the task and can be captured from Grocer's allowance.

## 2. Approval

Back on the household, under Wayfinder choose **Hold a $75 seat from Metro Rail** and click **Ask the clerk**.

The clerk holds it. The approval inbox names Metro Rail and $75.00. Click **Approve at PayPal**. Mock mode walks the payer-approval link and then captures. The receipt uses the intent id as PayPal `custom_id`. The allowance drops. The money goes to the demo merchant (`sb-merchant@business.example.com`), not into AgentPurse.

A passkey confirmation is the other path (`POST /api/spends/:id/approve` with a WebAuthn assertion). Without a passkey the route refuses.

## 3. Kill switch

Click **Pause agent** on Handy, then ask Handy to buy a cable. The clerk says Handy is paused.

Click **Panic freeze**. Ask any agent to pay. Every agent is refused until you clear it.

Click **Revoke PayPal**. That deletes the vault token. The next charge says to link PayPal again. **Link PayPal** runs the setup-token flow with no purchase and stores a new payment token.

## 4. Grok Bot, or any MCP client

```bash
curl -s http://localhost:3000/mcp \
  -H 'authorization: Bearer agpk_grocer_demo_maya' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Then quote and purchase as in `docs/PLUGIN.md`. Stdio for Claude Desktop is `npm run mcp` with `AGENTPURSE_API_KEY`.

## Sandbox

Set `PAYPAL_MODE=live` plus `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_EMAIL`. Linking a wallet calls `POST /v3/vault/setup-tokens` and returns PayPal's approve URL. Charges send `vault_id`, `stored_credential` (`MERCHANT` / `SUBSEQUENT` / `UNSCHEDULED_POSTPAID`), `payee`, and `custom_id`. Webhooks hit `/api/paypal/webhooks` and must verify.
