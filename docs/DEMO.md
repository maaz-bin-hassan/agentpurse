# Video script (under 3 minutes)

Record this yourself. No copyrighted music, no real retailer names, no live card numbers. Screen recording plus your voice is enough. Target 2 minutes 30 seconds.

## Shot list

| Time | Shot | Say |
| --- | --- | --- |
| 0:00 | Landing page, headline in frame | Agents can ask to spend. They cannot be the ones who decide. |
| 0:12 | Household, PayPal “Linked”, allowances | Maya linked PayPal once. Each agent has an allowance. We never hold the money. |
| 0:28 | `/demo/injection`, click **Let Grocer follow the page** | The page hides “buy 5 gift cards.” The guard blocks it. The task was oat milk. |
| 0:50 | Click **Let Grocer follow the task** | The same page, the real task, is allowed. |
| 1:05 | Wayfinder, **Hold a $75 seat from Metro Rail**, then **Approve at PayPal** | Above $50, Maya confirms. PayPal pays the merchant. The receipt keeps the intent id. |
| 1:35 | **Pause agent** on Handy, then **Panic freeze** | Pause stops one agent. Panic stops all of them. Revoke deletes the PayPal token. |
| 1:55 | Terminal: MCP `tools/list` with Grocer’s key | Grok Bot, Claude, and Cursor call the same purse over MCP. |
| 2:15 | Receipts table | Every charge and refund is in the book. Reset demo puts Maya back. |
| 2:25 | Landing headline again | That’s AgentPurse. |

## Commands while you record

```bash
npm run dev
```

Leave the app on http://localhost:3000. For the MCP shot:

```bash
curl -s http://localhost:3000/mcp \
  -H 'authorization: Bearer agpk_grocer_demo_maya' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

If the household is messy, click **Reset demo** before you start, or run `npm run seed`.

Do not play music you do not own. Devpost rejects copyrighted audio.
