# Submission checklist

Hackathon: [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Early eligibility check if submitted by **5 November 2026**. Final deadline **12 November 2026, 12:00 Pacific**. Judging runs 1–15 December. Winners around 21 December.

The repository was created on GitHub on 29 October 2026, after the 1 October 2026 opening.

## Rules

| Rule | Status | Where |
| --- | --- | --- |
| Public GitHub repo created after 1 October 2026 | Done. Created 29 October 2026. | This repository |
| MIT license visible in the repo | Done. `LICENSE` is MIT, copyright 2026 MaAz Khan Hassan. | `LICENSE` |
| Project uses PayPal and AI | Done in code. Vault + Orders v2, plus a guard. Mock mode needs no keys. The sandbox run is still to do. | `docs/ARCHITECTURE.md` |
| Working demo judges can run | Live at https://agentpurse.vercel.app in mock mode. Sandbox mode is next. | README **For judges** |
| No real money, no real retailers | Done. Merchants are fictional. Mock mode never calls PayPal. | Seed data |
| Video under 3 minutes, no copyrighted music | Not recorded yet. Script and shot list are ready. | `docs/DEMO.md` |
| List every AI tool used | Done, including Cursor and Grok Bot. | `docs/AI-TOOLS.md` |
| Sandbox credentials available to judges through 15 December 2026 | Not in the repo, on purpose. | MaAz keeps them |
| Submission form on Devpost | Not submitted. | MaAz |

## Only MaAz can do these

1. Create two PayPal sandbox accounts with the country set to the United States: one personal (the payer Maya links) and one business (the merchant `PAYPAL_MERCHANT_EMAIL`).
2. Create a REST app on developer.paypal.com and copy the sandbox client id and secret into the host’s env. Do not commit them.
3. Create a free Supabase project, run `supabase/migrations/0002_agentic_commerce.sql`, and set `DATABASE_URL` to the pooler URI (port 6543) for Vercel.
4. Optional: a free Groq or Gemini key if you want `AI_MODE=live`. The demo does not need it.
5. Follow **PayPal sandbox demo** in `docs/DEPLOY.md`, then run its checklist on the public URL.
6. Link a wallet with the sandbox personal account. If a judge revokes it, link it again.
7. Register the webhook. URL: `https://agentpurse.vercel.app/api/paypal/webhooks`.
8. Record the video from `docs/DEMO.md`. Keep it under 3 minutes. No copyrighted music.
9. Submit on Devpost by 5 November 2026 for the early eligibility check. You can keep editing until 12 November.
10. Hold the sandbox client id, secret, and a short note on how to set `PAYPAL_MODE=live` until 15 December 2026 so judges can ask.

## Suggested GitHub About

Description: A purse AI agents spend from. PayPal charges the merchant. The model does not move the money.

Topics: `paypal`, `ai-agents`, `mcp`, `nextjs`, `hackathon`, `agentic-commerce`, `typescript`.
