# AgentPurse

Your agent can shop. Only the clerk can pay. AgentPurse is a purse AI agents spend from. Agents find real offers through Channel3. The payer links PayPal once. Each agent has an allowance, an API key, and a policy. A guard checks the purchase against the user's task. A clerk allows, holds, or denies it in code. PayPal then charges the vaulted wallet and pays the merchant. AgentPurse does not hold the money.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Default mode is `PAYPAL_MODE=mock`: the whole demo runs with no PayPal, model, or Supabase account.

## For judges

Live demo: https://agentpurse.vercel.app. Its badge shows **PayPal sandbox** or **Mock PayPal**. The commands below run the same demo locally. No PayPal account, model key, or Supabase project is required.

### 60-second quickstart

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000, then http://localhost:3000/purses/purse_maaz. `GET /api/health` reports `paypalMode: "mock"` and `credentialsRequired: false`. **Reset demo** on the household page restores the seed.

### Test logins

There is no password. In mock mode the browser receives an httpOnly demo session for Maaz Hassan. Agent API keys:

| Who | Key |
| --- | --- |
| Grocer | `agpk_grocer_demo_maaz` |
| Wayfinder | `agpk_wayfinder_demo_maaz` |
| Stack | `agpk_stack_demo_maaz` |
| Handy | `agpk_handy_demo_maaz` |

Sandbox client id and secret are not in this repo. MaAz keeps those for judges through 15 December 2026. See `docs/SUBMISSION_CHECKLIST.md`.

What you are judging:

- **PayPal** is Payment Method Tokens v3 (save a wallet with no purchase) and Orders v2 charges against the saved wallet (`vault_id`, `custom_id` = intent id), plus refunds and webhook handling. In the sandbox, charges pay the business account that owns the REST app. `src/paypal/live.ts` calls the sandbox only when `PAYPAL_MODE=live`.
- **AI** parses sentences, and the guard blocks prompt injection. `AI_MODE=mock` does this locally. Groq or Gemini are optional and cannot override the clerk or the guard.
- **Channel3** supplies the catalog: search, product detail, URL lookup, similar products, 90-day price history, and price-change webhooks. The server reads every price, so an agent can never name its own.
- **MCP** exposes `search_products`, `get_product`, `check_price`, `find_alternatives`, `search_merchants`, `get_quote`, `request_purchase`, `watch_price`, `list_watches`, `cancel_watch`, `get_budget`, and `list_receipts` over stdio and streamable HTTP. Agent API keys are the working sign-in. See `docs/PLUGIN.md`.
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) is behind four read-only MCP tools: `paypal_get_order`, `paypal_list_transactions`, `paypal_list_disputes`, and `paypal_get_dispute`. Each answer is limited to the caller's own orders. The toolkit's money-moving tools (create or pay an order, invoices, refunds, subscriptions, payouts) are switched off in its configuration and refused by name, with a pointer to `request_purchase`, so the guard and the clerk still decide every payment. The package loads only when `PAYPAL_MODE=live`. In mock mode the same four tools read the local ledger. See `src/paypal/toolkit.ts` and `tests/toolkit.test.ts`.
- **The clerk** is ordinary TypeScript. Allowances, caps, the denylist, pause, and panic are not model opinions.

Three-minute path (`docs/DEMO.md`):

1. Open `/demo/injection`. Let Grocer follow the hidden gift-card line. It is blocked. The oat-milk task is not.
2. Hold a $75 Metro Rail seat and click **Approve and pay**.
3. Open **Shop**, search for a USB-C charger, and ask the clerk. Then set a watch on headphones and watch the clerk rule when the price drops.
4. Pause an agent, hit **Panic freeze**, then **Revoke PayPal** (the vault token is deleted).
5. Call the MCP server with `Authorization: Bearer agpk_grocer_demo_maaz` and ask it to buy oat milk.

Paste-ready submission text is in `docs/DEVPOST.md`. The video script is `docs/DEMO.md`. The rule-by-rule status is `docs/SUBMISSION_CHECKLIST.md`. Deploy notes are in `docs/DEPLOY.md`. AI tools are listed in `docs/AI-TOOLS.md`. The architecture diagram is in `docs/ARCHITECTURE.md`.

Suggested GitHub About description: “A purse AI agents spend from. PayPal charges the merchant. The model does not move the money.”

Suggested topics: `paypal`, `ai-agents`, `mcp`, `nextjs`, `hackathon`, `agentic-commerce`, `typescript`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest. No network. |
| `npm run seed` | Loads Maaz Hassan's household into the local database. Safe to repeat. |
| `npm run dev` | Next.js on port 3000. Seeds the demo if the database is empty. |
| `npm run build` | Production build. |
| `npm run mcp` | Stdio MCP server. Requires `AGENTPURSE_API_KEY`. |

## Environment

Copy `.env.example` only if you want to change defaults. Unset means mock.

| Variable | Default | Role |
| --- | --- | --- |
| `PAYPAL_MODE` | `mock` | `live` calls the PayPal sandbox |
| `AI_MODE` | `mock` | `live` calls Groq or Gemini for intent and policy drafts |
| `CHANNEL3_MODE` | `mock` | `live` calls Channel3. Needs `CHANNEL3_API_KEY` |
| `CHANNEL3_WEBHOOK_SECRET` | unset | Verifies price-change webhooks |
| `DATABASE_URL` | unset | Postgres (Supabase). Unset uses SQLite |
| `AGENTPURSE_DB` | `data/agentpurse.db` | SQLite file |
| `AGENTPURSE_AUTO_SEED` | on | Set to `0` to skip the demo seed |
| `AGENTPURSE_API_KEY` | unset | Agent key for `npm run mcp` |
| `AGENTPURSE_SANDBOX_DEMO` | unset | `1` opens the public sandbox demo. Needs `DEMO_SESSION_SECRET` and the sandbox host |

## License

MIT. See `LICENSE`.
