# AI tools used

| Tool | Role | Required to run the demo |
| --- | --- | --- |
| Cursor | IDE and cloud agents that wrote and reviewed this repository | No |
| Grok Bot | Assistant used while designing the plugin and MCP install path. The product also ships a Grok Bot plugin. | No |
| Grok 4.7 | Model used by the Cursor cloud agent that implemented the app, tests, and docs | No |
| Claude Code | Pair programming, tests, debugging the live deployment, and building the demo video with Remotion | No |
| ElevenLabs | Voiceover in the demo video | No |
| Local intent parser | Turns a sentence into a merchant, amount, and category | Yes |
| Local policy compiler | Library code, tested, not yet connected to the app | Not in the demo |
| Local intent guard | Blocks hidden instructions and goal drift | Yes |
| Groq free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=groq` | No |
| Gemini free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=gemini` | No |
| DeepSeek | Live intent parser on the hosted demo (`AI_MODE=live`, `AI_PROVIDER=deepseek`) | No |

A live model cannot authorize a payment, clear a guard block, raise an allowance, or lift a panic freeze. The clerk in `src/policy/engine.ts` is ordinary TypeScript.

No copyrighted images, logos, or audio are in the repo. The favicon and Open Graph card are original. PayPal is named as the payment rail, which the hackathon requires.

## Channel3

Channel3 is the product catalog behind shopping. AgentPurse uses `POST /v1/search`, `GET /v1/products/{id}`, `POST /v1/lookup`, `POST /v1/similar`, `GET /v0/price-tracking/history/{id}`, `POST` and `DELETE /v1/product-subscriptions`, and signed `offer.price.changed` webhooks. It returns data. The guard and the clerk decide.
