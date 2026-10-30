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

## Out of scope for this plan

Partial refunds, live Supabase in the default process, webhooks from PayPal to a public URL, and any path where a model sets a cap or approves its own hold.
