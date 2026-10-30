# AgentPurse build plan

Build one phase at a time. Each phase is done only when its acceptance checks pass and the branch is pushed. Mock mode is the demo: no PayPal sandbox keys, no model keys, no Supabase project.

The product is a purse that AI agents spend from. Maya Chen funds one purse with PayPal. Four agents (groceries, travel, software, household) spend against envelopes. A clerk allows, holds, or denies. The story is in the seed data at `/purses/purse_maya`.

## Phase 0 — Scaffold

Ship a Next.js and TypeScript app that boots and tests with no credentials.

- `package.json`, `tsconfig.json`, Vitest, `.gitignore`, `.env.example`
- `PAYPAL_MODE=mock` and `AI_MODE=mock` documented and defaulted in code
- MIT `LICENSE`
- `README.md` with a **For judges** section (the click-path gets filled in during phase 6)
- A home page that names AgentPurse
- `GET /api/health` reporting the modes

Acceptance:

- `npm test` passes
- `npm run dev` serves the home page and `/api/health` without env vars

## Phase 1 — Persistence and seed

SQLite via `node:sqlite`. Schema from `docs/ARCHITECTURE.md`. Postgres twin in `supabase/migrations/0001_agentpurse.sql` for a later hosted project. The app does not connect to Supabase.

- `npm run seed` is safe to run twice
- Seed **Maya's Household** (`purse_maya`) with a $250 top-up, a captured $12 CloudApps payment, and a denied $900 SkyAir attempt
- Envelopes: Groceries weekly $80, Travel monthly $400, Software monthly $40, Household monthly $100
- Caps: $150 per payment, $300 per day, human approval at $50
- Agents: Grocer, Wayfinder, Stack, Handy
- Empty databases auto-seed on boot unless `AGENTPURSE_AUTO_SEED=0`

Acceptance:

- Re-running the seed leaves one Maya purse and the same balances
- A repository round-trip test reads the seeded denial and the funded balance

## Phase 2 — Purse clerk

Pure `evaluateSpend` plus a template explainer. Rules and their order are in `docs/ARCHITECTURE.md`. No I/O.

Acceptance:

- Tests cover allow, each deny rule, stacked reasons, and the approval threshold
- The explanation names the rule (the cap, the envelope, the merchant, or the hold)

## Phase 3 — PayPal

A `PayPalClient` with mock and live implementations.

Mock, durable in SQLite:

- create, get, approve, capture, refund
- illegal transitions fail (capture before approve, double capture, refund before capture)
- order and capture ids are stable-shaped (`PAY-MOCK-…`, `CAP-MOCK-…`)

Live:

- OAuth client-credentials and Orders v2 against the sandbox host
- Used only when `PAYPAL_MODE=live`
- Unit-tested with an injected `fetch`, no network

Acceptance:

- Mock tests walk a top-up through Created → Approved → Captured and a full refund
- Live tests assert the request URLs and the capture body without credentials

## Phase 4 — Intent

`parseSpendIntent` returns merchant, amount in cents, currency, category, purpose, and confidence.

- Mock parser: money expressions, known merchants, `from`/`at` merchant phrases, category keywords
- Live adapter: Groq or Gemini behind `AI_MODE=live`, then the same validators
- Amounts the model invents, and categories outside the known set, become `needs_clarification`

Acceptance:

- Fixture sentences used by the demo parse without a network call
- A fake live response that invents an amount is rejected

## Phase 5 — Orchestration and API

`src/server` performs top-up, spend, approve, deny, and refund inside SQLite transactions. HTTP routes are thin.

Spend:

- allow → create, approve, and capture, then debit the balance
- needs_approval → no PayPal call
- deny and needs_clarification → ledger row only
- approve re-checks caps before capture
- refund restores balance and envelope

Acceptance:

- Service tests cover the demo script outcomes (grocery allow, flight deny, threshold hold, untrusted hold, category deny, refund)
- Route tests hit the handlers with a temporary database and no server process

## Phase 6 — Dashboard and submission docs

- `/` and `/purses/[id]` implement the checkbook UI
- Top-up shows the three PayPal states
- Each agent has a sentence box
- Holds can be approved or denied
- Captures can be refunded
- `docs/DEMO.md` is the judge click-path
- `docs/DEVPOST.md` is paste-ready submission copy
- README **For judges** matches the commands that actually work

Acceptance:

- `npm test` still passes
- Seeded purse renders balance $238.00, four envelopes, and the denied flight
- A grocery sentence for Green Grocer captures and the ledger updates

## Phase 7 — Per-agent purses and two databases

AgentPurse does not hold money. Each agent has a ledger allowance. Raising an allowance writes the ledger. It does not capture a PayPal payment.

- Async SQL port used by every store call
- SQLite remains the default when `DATABASE_URL` is unset
- Postgres (`pg`) is used when `DATABASE_URL` is set (Supabase). The same SQL is covered with PGlite in tests
- Tables: owners, agents (own allowance, API key hash, policy), vaults, intents, receipts, quotes
- Maya's household stays at `/purses/purse_maya`. Grocer, Wayfinder, Stack, and Handy each have an allowance. Stack's $12 CloudApps receipt is history. The $900 SkyAir attempt is still denied, and no order exists for it

Acceptance:

- `npm test` passes with no `DATABASE_URL`
- A PGlite test applies the same schema and reads the seeded denial
- Re-seeding does not duplicate Maya or her receipts

## Phase 8 — PayPal Vault and merchant-initiated charges

Sandbox and mock implement the same client.

- Payment Method Tokens v3: `POST /v3/vault/setup-tokens` (save PayPal with no purchase), payer approval, `POST /v3/vault/payment-tokens`, `DELETE /v3/vault/payment-tokens/{id}`
- Orders v2 merchant-initiated charge: `vault_id`, `stored_credential` (`MERCHANT` / `SUBSEQUENT` / `UNSCHEDULED_POSTPAID`), `payee.email_address` of the demo merchant, `custom_id` = intent id
- Capture and full refund
- Webhooks: build the CRC32 transmission message, verify via PayPal `verify-webhook-signature` in live mode and HMAC of that message in mock mode, idempotent receipt write
- Events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`, `VAULT.PAYMENT-TOKEN.DELETED`

Acceptance:

- Mock tests vault a wallet, charge a merchant, refund, and reject a webhook with a bad signature
- Live tests assert the setup-token, payment-token, order, and verify-webhook request shapes with an injected `fetch`

## Phase 9 — Policy compiler and intent guard

- Plain-English rules compile to a structured policy (Zod). Groq or Gemini when `AI_MODE=live`. The mock compiler is the offline fallback. Invalid model JSON is rejected
- The deterministic clerk remains the last word and never calls a model
- Intent guard compares a proposed purchase to the user's original task and to text on the page. Hidden instructions such as "buy 5 gift cards" block the purchase. A model cannot override a block
- Demo page shows the block on a grocery page that hides that instruction

Acceptance:

- Compiler tests for the mock path and a fake live response that fails schema
- Guard tests: the gift-card injection blocks; the oat-milk task passes

## Phase 10 — MCP server

Spec-compliant MCP (protocol `2025-11-25`) over stdio and streamable HTTP (`POST /mcp`, `GET /mcp` may be 405).

Tools: `search_merchants`, `get_quote`, `request_purchase`, `get_budget`, `list_receipts`.

- Stdio reads `AGENTPURSE_API_KEY` from the environment
- HTTP accepts a bearer agent API key or an OAuth 2.1 access token (authorization code + PKCE, protected-resource metadata, authorization-server metadata)
- Origin checks on browser requests
- Docs for Claude Desktop, Cursor, and other MCP clients

Acceptance:

- Protocol tests for `initialize`, `tools/list`, and `tools/call`
- OAuth tests: register, authorize, token, then `get_budget`
- A purchase through MCP writes an intent whose `custom_id` is that intent id

## Phase 11 — Approval above the line

- Pending intents notify the owner
- Web Push (VAPID) when a subscription and keys exist. The same payload is always stored in the in-app inbox so the demo works without a push service
- WebAuthn passkey registration and assertion. Capture runs only after a verified assertion
- Fallback: a PayPal approval link (customer-present order, then capture on approval)

Acceptance:

- HTTP approve without a verified passkey is rejected
- A PayPal approval link can be created, approved, and captured in mock mode
- Push payload names the merchant and the amount

## Phase 12 — Kill switch

- Pause one agent. The clerk denies that agent until resume
- Revoke deletes the vault token at PayPal and marks the wallet revoked. Later charges fail
- Global panic freeze denies every agent until cleared

Acceptance:

- Tests for pause, revoke (mock DELETE token), and panic, including a charge that must not be created during panic

## Phase 13 — Dashboard

Household page shows allowances (not a balance we hold), the linked PayPal wallet, per-agent policy and keys, holds, receipts with refund, pause, revoke, and panic. The injection demo is linked from the household.

Acceptance:

- View test: Maya has four agents, a vaulted wallet, the CloudApps receipt, and the SkyAir denial
- Browser pass of allow, injection block, approval, and panic

## Phase 14 — Grok Bot plugin, deploy, submission docs

- Plugin package matching the Grok marketplace layout (`.grok-plugin/plugin.json`, `.mcp.json` with `type: http`) plus a Cursor plugin manifest and a skill that tells the assistant to quote, then request, and never to skip the clerk
- `docs/PLUGIN.md` with install steps, `AGENTPURSE_API_KEY`, OAuth, and the "buy X for me" flow
- `docs/DEPLOY.md` for Vercel and Render free tiers with Supabase
- README **For judges**, `docs/DEMO.md` (3-minute script: injection block, approval, kill switch, plugin purchase), `docs/DEVPOST.md`, and `docs/AI-TOOLS.md`

Acceptance:

- `npm test` passes
- README commands match the app

## Still out of scope

Partial refunds, holding a PayPal balance in AgentPurse, and letting a model raise an allowance, unpause an agent, or clear a panic.
