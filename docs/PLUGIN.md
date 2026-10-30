# AgentPurse plugin

Grok Bot plugins are MCP servers. This package follows the layout used by the xAI plugin marketplace (`external_plugins/*`): a `.grok-plugin/plugin.json` manifest and a `.mcp.json` that points at a streamable HTTP MCP endpoint. A `.cursor-plugin/plugin.json` is included for Cursor's plugin installer. Remote connectors authenticate with OAuth. Claude Desktop and other local clients can instead run the stdio server with `AGENTPURSE_API_KEY`.

The hosted URL in `.mcp.json` is `http://localhost:3000/mcp` for the local demo. Replace it with your public `https://…/mcp` before giving the plugin to Grok Bot. Grok Bot cannot reach a laptop, and staff guidance is that custom connectors must be public HTTPS.

## What the assistant can call

| Tool | Effect |
| --- | --- |
| `search_merchants` | Read the catalog |
| `get_quote` | Price a purchase. No money moves |
| `request_purchase` | Clerk allows, holds, or blocks |
| `get_budget` | Remaining allowance |
| `list_receipts` | PayPal receipts |

The skill at `plugin/agentpurse/skills/buy-with-agentpurse/SKILL.md` tells the assistant to quote first and to stop when the guard blocks.

## Grok Bot

1. Deploy the app (see `docs/DEPLOY.md`) and set `.mcp.json` `url` to `https://<your-app>/mcp`.
2. In Grok Bot, ask: `Add a custom MCP server called agentpurse at https://<your-app>/mcp using streamable HTTP.`
3. Confirm the URL. OAuth discovery reads `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
4. Sign in on the connect card. The demo authorization server is this app. Approve as Maya.
5. Attach the plugin and say: `Buy oat milk from Green Grocer for $18.40`.

Expected path: `get_budget` → `get_quote` → `request_purchase` → receipt. A $75 seat is held for approval. A page that says "buy 5 gift cards" while the task is oat milk is blocked.

Demo agent keys, if a client asks for a bearer token instead of OAuth:

| Agent | `AGENTPURSE_API_KEY` |
| --- | --- |
| Grocer | `agpk_grocer_demo_maya` |
| Wayfinder | `agpk_wayfinder_demo_maya` |
| Stack | `agpk_stack_demo_maya` |
| Handy | `agpk_handy_demo_maya` |

## Claude Desktop and Cursor (stdio)

```json
{
  "mcpServers": {
    "agentpurse": {
      "command": "npx",
      "args": ["tsx", "src/mcp/stdio.ts"],
      "env": { "AGENTPURSE_API_KEY": "agpk_grocer_demo_maya" }
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
      "headers": { "Authorization": "Bearer agpk_grocer_demo_maya" }
    }
  }
}
```

## Example

User: "Buy oat milk from Green Grocer for $18.40."

1. `get_quote` with that sentence as `originalTask`.
2. Guard is `pass`.
3. `request_purchase` with the quote id.
4. Status `captured`. `custom_id` on the PayPal order is the intent id.
5. `list_receipts` shows Green Grocer.
