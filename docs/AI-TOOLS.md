# AI tools used

| Tool | Role | Required to run the demo |
| --- | --- | --- |
| Cursor | IDE and cloud agents that wrote and reviewed this repository | No |
| Grok Bot | Assistant used while designing the plugin and MCP install path. The product also ships a Grok Bot plugin. | No |
| Grok 4.7 | Model used by the Cursor cloud agent that implemented the app, tests, and docs | No |
| Local intent parser | Turns a sentence into a merchant, amount, and category | Yes |
| Local policy compiler | Library code, tested, not yet connected to the app | Not in the demo |
| Local intent guard | Blocks hidden instructions and goal drift | Yes |
| Groq free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=groq` | No |
| Gemini free tier | Optional when `AI_MODE=live` and `AI_PROVIDER=gemini` | No |
| PayPal Agent Toolkit (`@paypal/agent-toolkit`) | Four read-only PayPal tools for agents over MCP: order details, transactions, disputes. Loads only when `PAYPAL_MODE=live` | No. Mock mode answers the same tools locally |

A live model cannot authorize a payment, clear a guard block, raise an allowance, or lift a panic freeze. The clerk in `src/policy/engine.ts` is ordinary TypeScript.

No copyrighted images, logos, or audio are in the repo. The favicon and Open Graph card are original. PayPal is named as the payment rail, which the hackathon requires.

## PayPal Agent Toolkit

PayPal's Agent Toolkit gives an agent PayPal API tools. AgentPurse passes only four through its MCP server: `paypal_get_order`, `paypal_list_transactions`, `paypal_list_disputes`, and `paypal_get_dispute`. Each answer is limited to the caller's own orders. The toolkit's tools that move money, such as `create_order`, `pay_order`, `create_invoice`, `send_invoice`, `create_refund`, subscriptions, and payouts, are switched off in the toolkit's configuration. If an agent calls one anyway, AgentPurse refuses it before the toolkit runs and points the agent to `request_purchase`. There the intent guard and the clerk in `src/policy/engine.ts` decide. The wall is in `src/paypal/toolkit.ts` and tested in `tests/toolkit.test.ts`.

## Channel3

Channel3 is the product catalog behind shopping. AgentPurse uses `POST /v1/search`, `GET /v1/products/{id}`, `POST /v1/lookup`, `POST /v1/similar`, `GET /v0/price-tracking/history/{id}`, `POST` and `DELETE /v1/product-subscriptions`, and signed `offer.price.changed` webhooks. It returns data. The guard and the clerk decide.
