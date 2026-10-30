# AI tools used

| Tool | Role | Required to run the demo |
| --- | --- | --- |
| Cursor | IDE and cloud agents that wrote and reviewed this repository | No |
| Grok Bot | Assistant used while designing the plugin and MCP install path. The product also ships a Grok Bot plugin. | No |
| Grok 4.7 | Model used by the Cursor cloud agent that implemented the app, tests, and docs | No |
| Local intent parser | Turns a sentence into a merchant, amount, and category | Yes |
| Local policy compiler | Turns a plain-English rule into JSON checked with Zod | Yes |
| Local intent guard | Blocks hidden instructions and goal drift | Yes |
| Groq free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=groq` | No |
| Gemini free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=gemini` | No |

A live model cannot authorize a payment, clear a guard block, raise an allowance, or lift a panic freeze. The clerk in `src/policy/engine.ts` is ordinary TypeScript.

No copyrighted images, logos, or audio are in the repo. The favicon and Open Graph card are original. PayPal is named as the payment rail, which the hackathon requires.
