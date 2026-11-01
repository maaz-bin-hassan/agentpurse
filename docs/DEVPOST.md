# Devpost copy

## Project name

AgentPurse

## Tagline

The purse an agent spends from. PayPal charges the merchant. The model does not move the money.

## About the project

Agents are starting to buy things. A prompt is not a receipt, and a wallet the app holds is the wrong shape: the payer already has PayPal. AgentPurse links that wallet once, gives each agent its own allowance and key, and lets the agent ask in a sentence. A guard checks the ask against the user's task. A clerk applies caps in code. PayPal then pays the merchant. Above a line, the purchase waits as a held cheque until the owner signs it on the dashboard. One switch pauses an agent, deletes the vault token, or freezes the household.

## What it does

- Saves PayPal with Payment Method Tokens v3. No purchase is required to link.
- Charges the saved wallet with Orders v2 using `vault_id`, with the intent id in `custom_id`. In the sandbox, payments go to the business account that owns the app, which stands in for merchants.
- Captures, refunds, and verifies webhooks before they become receipts.
- Gives Claude, Grok, ChatGPT, or any MCP client its own allowance, API key, and policy.
- Blocks a hidden "buy 5 gift cards" instruction that is not the user's task.
- Shows held purchases on the dashboard for the owner to sign. An agent key can never sign.
- Pauses an agent, revokes the vault token at PayPal, or panic-freezes every payment.

The public demo runs on the real PayPal sandbox, and its receipts show PayPal order and capture ids. Run locally, the default is mock mode, so judges do not need keys.

## How we built it

Next.js, TypeScript, SQLite for the laptop, Postgres on Supabase when `DATABASE_URL` is set, Vitest, and PGlite so the Postgres schema is executed in tests. MCP is protocol `2025-11-25` over stdio and streamable HTTP, with an agent API key on every request. The Grok plugin package matches the marketplace layout (`.grok-plugin/plugin.json` and `.mcp.json`).

## Challenges

The easy design is an LLM risk score and a balance the app holds. Both are the wrong authority. We kept the model on the near side of a wall: it may read a sentence or draft a policy JSON document, and code decides. The second constraint was the hackathon clock. Mock mode had to perform the same vault, charge, webhook, and approval steps the sandbox client performs, or the demo would depend on accounts the judges do not have.

## Accomplishments

- A vaulted wallet, a merchant charge, a refund, and a signed webhook, with no dollars sitting in AgentPurse.
- An injection demo that blocks a gift-card instruction hidden on a grocery page.
- An MCP server a Grok Bot, Claude Desktop, or Cursor can call, plus a plugin skill that says to stop when the guard blocks.

## What we learned

Agentic commerce needs a purse, not a prompt. The interesting PayPal surface is the vault and the merchant-initiated order, because the agent is not the payer standing at checkout.

## What's next

Partial refunds, a hosted Supabase project for the public demo, and submitting the plugin to the Grok marketplace once the production URL is stable.

## Built with

Next.js, TypeScript, Node.js, SQLite, Postgres, Supabase, PayPal Payment Method Tokens v3, PayPal Orders v2, MCP, Zod, Vitest. Optional: Groq, Gemini, Vercel, Render.

## Try it out

```bash
git clone https://github.com/maaz-bin-hassan/agentpurse.git
cd agentpurse
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maaz and follow `docs/DEMO.md`.
