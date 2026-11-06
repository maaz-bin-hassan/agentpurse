# Submission checklist

Hackathon: [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Early eligibility check if submitted by **5 November 2026**. Final deadline **12 November 2026, 12:00 Pacific**. Judging runs 1–15 December. Winners around 21 December.

The repository was created on GitHub on 29 October 2026, after the 1 October 2026 opening.

## Rules

| Rule | Status | Where |
| --- | --- | --- |
| Public GitHub repo created after 1 October 2026 | Done. Created 29 October 2026. | This repository |
| MIT license visible in the repo | Done. `LICENSE` is MIT, and GitHub shows it in the About box. | `LICENSE` |
| GitHub About description and topics | Done. Description, homepage, and 10 topics set. | Repo settings |
| Project uses PayPal and AI | Done. Vault v3, Orders v2, refunds, and webhook verification on the real sandbox. Live AI (DeepSeek) parses intents on the hosted demo. Mock mode needs no keys. | `docs/ARCHITECTURE.md` |
| Working demo judges can run | Live at https://agentpurse.vercel.app on the PayPal sandbox. `/api/health` reports PayPal, AI, and Channel3 all live. | README **For judges** |
| Setup and run instructions in the repo | Done. Four commands, no keys. 111 tests pass offline. | README **60-second quickstart** |
| No real money | Done. PayPal runs in the sandbox only. | `docs/DEPLOY.md` |
| No third-party trademarks in the video without permission | Check the video. Live Channel3 returns real brands and stores (for example Targus, Newegg). Blur them or use the mock catalog in any re-cut. | `docs/DEMO.md` |
| Best Use of Channel3 | Live search runs on the hosted demo. Price-change webhook delivery still to confirm. | `docs/ARCHITECTURE.md` |
| Video under 3 minutes, public on YouTube, no copyrighted music | Uploaded: https://youtu.be/-5Y8ftuzQG4. Confirm it is Public (not Unlisted), under 3:00, and that the music is licensed. | `docs/DEMO.md` |
| List every AI tool used | Done: Cursor, Grok, Claude Code, ElevenLabs, DeepSeek, Groq, Gemini. | `docs/AI-TOOLS.md` |
| Testing access for judges through 15 December 2026 | The hosted demo needs no login and has a linked sandbox wallet. Client id and secret stay out of the repo and are shared on request. | README **For judges** |
| Judge walkthrough | Done. Click-by-click tour of the hosted demo, checked against the live site. | `docs/JUDGES.md` |
| Submission form on Devpost | Not submitted. | MaAz |

## Only MaAz can do these

1. Create two PayPal sandbox accounts with the country set to the United States: one personal (the payer Maaz links) and one business (the merchant `PAYPAL_MERCHANT_EMAIL`).
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
