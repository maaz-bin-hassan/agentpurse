# AI tools used

AgentPurse was built with Cursor cloud agents (Grok 4.7) writing the application, tests, and docs. The product itself calls models only for optional steps, and mock mode never does.

| Tool | Where it is used | Required for the demo |
| --- | --- | --- |
| Cursor / Grok 4.7 | Implementation of this repository | No |
| Local intent parser | Turns a sentence into merchant, amount, and category | Yes (default) |
| Local policy compiler | Turns a plain-English rule into JSON, checked with Zod | Yes (default) |
| Local intent guard | Blocks hidden instructions and goal drift | Yes (default) |
| Groq (free tier) | Optional `AI_MODE=live` with `AI_PROVIDER=groq` | No |
| Gemini (free tier) | Optional `AI_MODE=live` with `AI_PROVIDER=gemini` | No |

A live model cannot authorize a payment, clear a guard block, or change an allowance. The clerk in `src/policy/engine.ts` is ordinary TypeScript.
