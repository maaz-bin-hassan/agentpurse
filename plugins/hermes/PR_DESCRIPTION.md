## Add the AgentPurse plugin

AgentPurse is a checkbook for agents. This plugin lets Hermes search, quote, and buy inside a hard allowance. PayPal sandbox is the rail. The AgentPurse clerk still allows, holds, or denies the payment. Hermes shows its own approval prompt before `request_purchase` or `watch_price` is sent.

The entry to add is `plugins/hermes/catalog/agentpurse.yaml` in this repo, copied to `plugin-catalog/agentpurse.yaml` on hermes-agent. Replace `sha` with the full 40-character commit this repository lands on. `subdir` is `plugins/hermes`. `version` is `"1.0.0"`. `requires_hermes` is `">=0.22.7"`, the same floor as `plugin.yaml`.

### Surfaces

- Twelve tools, one per AgentPurse MCP tool, registered with `ctx.register_tool`.
- `pre_tool_call` on `request_purchase` and `watch_price`. The hook returns `block` or `approve`. `approve` is Hermes' human gate. The plugin never approves a payment itself.
- Slash command `/purse` with `budget`, `receipts`, `kill`, and `resume`.
- Bundled skill `shop`, registered with `ctx.register_skill`.
- No Desktop pane, no middleware, no shell, no background process.

The handler sends a purchase only after the hook records a one-time grant for that merchant, amount, chat, and tool-call id. Cron, single-query, unattended platforms, a missing approver, and `--yolo` are blocked before a prompt so the run cannot hang and Hermes' cron auto-approve mode cannot spend. `/purse kill` blocks the next purchase and cancels open price watches.

If the clerk holds a cheque, the plugin returns the dashboard URL and polls `GET /api/spends/:id` until the status settles or `approval_timeout_s` elapses.

### Disclosures (catalog rule 13)

- Network calls to the configured AgentPurse origin, default `https://agentpurse.vercel.app` (`POST /mcp`, `GET /api/spends/:id`). Through that server, the PayPal sandbox and Channel3. Redirects are refused so the bearer token stays on that host.
- `AGENTPURSE_API_KEY` is stored by Hermes and read with `agent.secret_scope.get_secret`. The plugin does not read `.env`, `auth.json`, or any other credential file.
- Plugin state holds a kill switch, a short quote cache, and a per-chat ledger of captured cents. The API key is not stored there.
- No shell commands, no child processes, no telemetry, no self-update, no Hermes core patch.
- Sandbox money only. A receipt is not a retailer order.

### Validation

`hermes plugins validate plugins/hermes --install-deps` and `hermes plugins doctor plugins/hermes --ci` are clean on Hermes 0.22.7. Pytest covers approve and block, spend-limit boundaries, the kill switch, cron and single-query fail-closed, passkey poll timeouts, and purchases that are not retried.

No UI screenshots: there is no Desktop or dashboard surface in this plugin. The approval card is Hermes' own prompt.
