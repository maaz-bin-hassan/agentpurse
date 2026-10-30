# AgentPurse

A purse AI agents spend from. The payer links PayPal once. Each agent has an allowance, an API key, and a policy. A guard checks the purchase against the user's task. A clerk allows, holds, or denies it in code. PayPal then charges the vaulted wallet and pays the merchant. AgentPurse does not hold the money.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Default mode is `PAYPAL_MODE=mock`: the whole demo runs with no PayPal, model, or Supabase account.

## For judges

You can review this without creating a PayPal sandbox account, a model key, or a Supabase project.

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maya. The first boot seeds Maya's household if the database is empty. `GET /api/health` reports `paypalMode: "mock"` and `credentialsRequired: false`.

What you are judging:

- **PayPal** is Payment Method Tokens v3 (save a wallet with no purchase) and Orders v2 merchant-initiated charges (`vault_id`, `stored_credential`, `payee`, `custom_id` = intent id), plus capture, refund, and signed webhooks. `src/paypal/live.ts` calls the sandbox only when `PAYPAL_MODE=live`.
- **AI** parses sentences, compiles plain-English rules (Zod), and blocks prompt injection. `AI_MODE=mock` does this locally. Groq or Gemini are optional and cannot override the clerk or the guard.
- **MCP** exposes `search_merchants`, `get_quote`, `request_purchase`, `get_budget`, and `list_receipts` over stdio and streamable HTTP. See `docs/PLUGIN.md` for Grok Bot, Claude Desktop, and Cursor.
- **The clerk** is ordinary TypeScript. Allowances, caps, the denylist, pause, and panic are not model opinions.

Three-minute path (`docs/DEMO.md`):

1. Open `/demo/injection`. Let Grocer follow the hidden gift-card line. It is blocked. The oat-milk task is not.
2. Hold a $75 Metro Rail seat and click **Approve at PayPal**.
3. Pause an agent, hit **Panic freeze**, then **Revoke PayPal** (the vault token is deleted).
4. Call the MCP server with `Authorization: Bearer agpk_grocer_demo_maya` and ask it to buy oat milk.

Paste-ready submission text is in `docs/DEVPOST.md`. Deploy notes are in `docs/DEPLOY.md`. AI tools are listed in `docs/AI-TOOLS.md`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest. No network. |
| `npm run seed` | Loads Maya Chen's household into the local database. Safe to repeat. |
| `npm run dev` | Next.js on port 3000. Seeds the demo if the database is empty. |
| `npm run build` | Production build. |
| `npm run mcp` | Stdio MCP server. Requires `AGENTPURSE_API_KEY`. |

## Environment

Copy `.env.example` only if you want to change defaults. Unset means mock.

| Variable | Default | Role |
| --- | --- | --- |
| `PAYPAL_MODE` | `mock` | `live` calls the PayPal sandbox |
| `AI_MODE` | `mock` | `live` calls Groq or Gemini for intent and policy drafts |
| `DATABASE_URL` | unset | Postgres (Supabase). Unset uses SQLite |
| `AGENTPURSE_DB` | `data/agentpurse.db` | SQLite file |
| `AGENTPURSE_AUTO_SEED` | on | Set to `0` to skip the demo seed |
| `AGENTPURSE_API_KEY` | unset | Agent key for `npm run mcp` |

## License

MIT. See `LICENSE`.
