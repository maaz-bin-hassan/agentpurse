# AgentPurse — guide for coding agents

AgentPurse is a checkbook for AI agents. Agents ask to spend in plain language. A deterministic purse clerk allows the payment, holds it for a human, or denies it. PayPal is the rail that moves the money. The model may read the sentence. It must never be the thing that moves the money.

This file is the working agreement for anyone (human or agent) changing the repo.

## Non-negotiables

- Money is integer cents. Never float currency.
- AgentPurse never holds funds. An allowance is a ledger number. PayPal charges the payer's vaulted wallet and pays the merchant.
- `PAYPAL_MODE=mock` is the default. `npm test`, `npm run seed`, and `npm run dev` must succeed with no API keys and no network.
- Policy lives in `src/policy/engine.ts` and is a pure function. Do not call an LLM from the policy engine. Do not let a model override a deny, a guard block, a pause, or a panic.
- The intent guard compares a purchase to the user's original task. Hidden page instructions cannot authorize a different purchase.
- AI may parse a sentence or compile a plain-English rule into JSON. Code validates that JSON and checks amounts against the sentence. The clerk still decides.
- Live PayPal (`PAYPAL_MODE=live`) and live AI (`AI_MODE=live`) are optional adapters. Missing credentials must not break mock mode.
- Revoke deletes the PayPal payment token. Do not only flip a local flag.
- Do not commit `.env`, database files, or secrets. `.env.example` stays placeholder-only.
- New policy rules need a failing test first, then the implementation.

## Commands

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maya after seeding. The app also seeds that demo purse on first boot when the database is empty, unless `AGENTPURSE_AUTO_SEED=0`.

## Layout

| Path | Role |
| --- | --- |
| `src/db` | SQLite and Postgres, demo seed |
| `src/policy` | Deterministic clerk |
| `src/paypal` | Vault, Orders v2, webhooks, mock and live |
| `src/ai` | Intent parser, policy compiler, intent guard |
| `src/server` | Purchase, approval, refund, kill switch |
| `src/mcp` | MCP tools, stdio entry |
| `app/mcp` | Streamable HTTP MCP |
| `app/api` | Thin HTTP wrappers |
| `plugin/` | Grok and Cursor plugin package |
| `supabase/migrations` | Schema applied to Supabase |
| `docs/PLAN.md` | Phases and acceptance checks |
| `docs/ARCHITECTURE.md` | How a dollar moves |

## Phase status

Keep this list honest when a phase lands.

- [x] Plan, architecture, and this guide
- [x] Phase 0 — scaffold, MIT license, mock env, judge-facing README
- [x] Phase 1 — schema, repository, seed script
- [x] Phase 2 — policy engine
- [x] Phase 3 — PayPal mock (full) and live adapter
- [x] Phase 4 — intent parsing
- [x] Phase 5 — orchestration and HTTP API
- [x] Phase 6 — dashboard, `docs/DEMO.md`, `docs/DEVPOST.md`
- [ ] Phase 7 — per-agent allowances, SQLite and Postgres
- [ ] Phase 8 — PayPal Vault, merchant charges, webhooks
- [ ] Phase 9 — policy compiler and intent guard
- [ ] Phase 10 — MCP stdio, streamable HTTP, OAuth
- [ ] Phase 11 — passkey approval, Web Push, PayPal approval link
- [ ] Phase 12 — pause, vault revoke, panic freeze
- [ ] Phase 13 — dashboard and injection demo
- [ ] Phase 14 — Grok plugin, deploy docs, submission copy

## Changing a rule

1. Add a case to `tests/policy.test.ts` that states the purse, the request, and the expected decision.
2. Extend `evaluateSpend` so the case passes without loosening older cases.
3. If the decision needs a new sentence, extend the explainer and assert the sentence names the rule that fired.
