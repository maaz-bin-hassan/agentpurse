# AgentPurse — guide for coding agents

AgentPurse is a checkbook for AI agents. Agents ask to spend in plain language. A deterministic purse clerk allows the payment, holds it for a human, or denies it. PayPal is the rail that moves the money. The model may read the sentence. It must never be the thing that moves the money.

This file is the working agreement for anyone (human or agent) changing the repo.

## Non-negotiables

- Money is integer cents. Never float currency.
- `PAYPAL_MODE=mock` is the default. `npm test`, `npm run seed`, and `npm run dev` must succeed with no API keys and no network.
- Policy lives in `src/policy/engine.ts` and is a pure function. Do not call an LLM from the policy engine. Do not let a model override a deny.
- AI parses intent only. Code checks that any amount the model returns actually appears in the user's sentence, and that the category is one the app knows.
- Live PayPal (`PAYPAL_MODE=live`) and live AI (`AI_MODE=live`) are optional adapters. Missing credentials fall back or fail with an explicit error. They must not break mock mode.
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
| `src/db` | SQLite schema, connection, demo seed |
| `src/policy` | Deterministic clerk |
| `src/paypal` | `PayPalClient` interface, mock, live sandbox adapter |
| `src/ai` | Intent parser, mock model, optional Groq/Gemini adapter |
| `src/server` | Spend, top-up, approval, refund orchestration |
| `app/api` | Thin HTTP wrappers over `src/server` |
| `app/` | Dashboard |
| `tests` | Vitest, no network |
| `supabase/migrations` | Postgres schema for a hosted Supabase project later |
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
- [ ] Phase 5 — orchestration and HTTP API
- [ ] Phase 6 — dashboard, `docs/DEMO.md`, `docs/DEVPOST.md`

## Changing a rule

1. Add a case to `tests/policy.test.ts` that states the purse, the request, and the expected decision.
2. Extend `evaluateSpend` so the case passes without loosening older cases.
3. If the decision needs a new sentence, extend the explainer and assert the sentence names the rule that fired.
