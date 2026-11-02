# AgentPurse plugin

Grok Bot plugins are MCP servers. This package follows the layout used by the xAI plugin marketplace (`external_plugins/*`): a `.grok-plugin/plugin.json` manifest and a `.mcp.json` that points at a streamable HTTP MCP endpoint. A `.cursor-plugin/plugin.json` is included for Cursor's plugin installer. Sign in with an agent API key as a bearer token. OAuth is not finished: there is no authorization page yet, so a client that insists on OAuth cannot connect. Claude Desktop and other local clients can instead run the stdio server with `AGENTPURSE_API_KEY`.

The URL in `.mcp.json` is the public demo, `https://agentpurse.vercel.app/mcp`. Use `http://localhost:3000/mcp` for local work. Grok Bot cannot reach a laptop, and staff guidance is that custom connectors must be public HTTPS.

## What the assistant can call

| Tool | Effect |
| --- | --- |
| `search_products` | Search Channel3 offers. No money moves |
| `get_product` | Read a product by id or pasted URL |
| `check_price` | Low, typical, or high against 90 days of history |
| `find_alternatives` | Similar products under a price |
| `watch_price`, `list_watches`, `cancel_watch` | Wait for a target price. The clerk still decides |
| `search_merchants` | Read the known merchants |
| `get_quote` | Quote a catalog product or merchant. The server reads catalog prices |
| `request_purchase` | Clerk allows, holds, or blocks |
| `get_budget` | Remaining allowance |
| `list_receipts` | PayPal receipts |

The skill at `plugin/agentpurse/skills/buy-with-agentpurse/SKILL.md` tells the assistant to quote first and to stop when the guard blocks.

## Grok Bot

This path is not yet tested with Grok Bot itself.

1. In Grok Bot, ask: `Add a custom MCP server called agentpurse at https://agentpurse.vercel.app/mcp using streamable HTTP.`
2. Give it a demo agent key below as the bearer token.
3. Attach the plugin and say: `Buy oat milk from Green Grocer for $18.40`.

Expected path: `get_budget` → `get_quote` → `request_purchase` → receipt. A $75 seat is held for approval. A page that says "buy 5 gift cards" while the task is oat milk is blocked.

Demo agent keys:

| Agent | `AGENTPURSE_API_KEY` |
| --- | --- |
| Grocer | `agpk_grocer_demo_maaz` |
| Wayfinder | `agpk_wayfinder_demo_maaz` |
| Stack | `agpk_stack_demo_maaz` |
| Handy | `agpk_handy_demo_maaz` |

## Claude Desktop and Cursor (stdio)

```json
{
  "mcpServers": {
    "agentpurse": {
      "command": "npx",
      "args": ["tsx", "src/mcp/stdio.ts"],
      "env": { "AGENTPURSE_API_KEY": "agpk_grocer_demo_maaz" }
    }
  }
}
```

Run it from this repository after `npm install`. The process speaks MCP stdio framing (`Content-Length`).

## Cursor remote MCP

```json
{
  "mcpServers": {
    "agentpurse": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer agpk_grocer_demo_maaz" }
    }
  }
}
```

## Test the endpoint without deploying

With `npm run dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

That is `401`. The same call with `Authorization: Bearer agpk_grocer_demo_maaz` and `Accept: application/json, text/event-stream` returns the twelve tools. `tests/mcp.test.ts` covers the tool calls. `npm run mcp` is the stdio process for Claude Desktop.

## Example

User: "Buy oat milk from Green Grocer for $18.40."

1. `get_quote` with that sentence as `originalTask`.
2. Guard is `pass`.
3. `request_purchase` with the quote id.
4. Status `captured`. `custom_id` on the PayPal order is the intent id.
5. `list_receipts` shows Green Grocer.
