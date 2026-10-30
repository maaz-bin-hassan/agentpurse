# Devpost copy

Paste-ready text for the PayPal AI Hackathon submission. The demo runs with `PAYPAL_MODE=mock`. Say that plainly in the submission so judges are not asked to create a sandbox account.

## Project name

AgentPurse

## Tagline

A checkbook AI agents spend from. The model may read the sentence. It does not move the money.

## About the project

AI agents are starting to buy things. A prompt is not a control. AgentPurse is the purse those agents spend from: envelopes, a hard per-payment cap, a daily cap, a merchant denylist, and a line above which a person has to say yes. PayPal is the rail that actually moves the dollars. The clerk that allows, holds, or denies a payment is ordinary TypeScript, and every reason is written into a ledger a person can read.

## What it does

Maya Chen funds one household purse. Four agents ask to spend in plain English: Grocer, Wayfinder, Stack, and Handy. Each sentence is parsed into a merchant, an amount, and a category. The clerk then:

- pays it, by creating a PayPal order, approving it, and capturing it
- holds it for Maya when the merchant is untrusted or the amount crosses $50
- denies it when the envelope, the cap, the balance, the agent's category, or the denylist says no

A denied $900 flight never creates a PayPal charge. A refund returns the capture to the purse and to the envelope. Top-ups walk the same three PayPal states: created, approved, captured.

## How we built it

- Next.js and TypeScript for the checkbook UI and the HTTP API
- SQLite, through Node's built-in `node:sqlite`, so the demo is one file and needs no hosted database
- A PayPal Orders v2 client. `PAYPAL_MODE=mock` (the default) stores orders in SQLite and enforces create → approve → capture → refund. `src/paypal/live.ts` is the sandbox adapter and is unit-tested with a fake `fetch`
- A local intent parser so the demo needs no model key. Optional Groq or Gemini adapters sit behind `AI_MODE=live`. Code rejects any amount the model did not copy from the sentence, and it keeps a known merchant's category from the catalog
- Vitest for the clerk, the mock PayPal transitions, the parser, and the full allow / hold / deny / refund story

A Postgres twin of the schema is in `supabase/migrations` for a later hosted project. The running demo does not call Supabase.

## Challenges we ran into

The tempting design is to ask a model "should this agent be allowed to spend?" That makes the safety layer as persuadable as the agent. We kept the model on one side of a wall: it may propose an intent, and deterministic rules dispose of it. The second challenge was the hackathon itself. Judges should not have to wait on sandbox keys, so the mock implements the same order lifecycle the live adapter calls.

## Accomplishments that we're proud of

- A working purse: fund, spend, hold, approve, deny, refund, with a ledger that quotes the rule
- The $900 flight is denied for every cap it breaks, and no PayPal order exists for it
- `npm test`, `npm run seed`, and `npm run dev` succeed with an empty environment

## What we learned

Payment policy wants to be boring code with a specific sentence attached to each rule. An agent can be useful at the edge of the purse and still be forbidden from editing the purse.

## What's next

- Point the live adapter at a PayPal sandbox buyer flow, including the redirect back from checkout
- Apply the Supabase migration when the purse should be hosted
- Partial refunds and per-agent budgets that are tighter than the envelope

## Built with

Next.js, TypeScript, Node.js, SQLite, PayPal Orders API v2, Vitest. Optional: Groq, Gemini, Supabase (schema only).

## Try it out

```bash
git clone https://github.com/maaz-bin-hassan/agentpurse.git
cd agentpurse
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maya and follow `docs/DEMO.md`.
