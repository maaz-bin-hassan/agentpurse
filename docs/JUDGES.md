# Judge's guide: try AgentPurse in 5 minutes

You need nothing but a browser. No sign-up, no PayPal account, and no API key.

- **Hosted demo:** https://agentpurse.vercel.app/purses/purse_maaz. It runs on the real **PayPal sandbox**, live Channel3 offers, and a live model (DeepSeek). A sandbox PayPal wallet is already linked.
- **Video (under 3 minutes):** https://youtu.be/-5Y8ftuzQG4
- **Health check:** https://agentpurse.vercel.app/api/health shows which services are live.

Opening the purse gives you a demo session as the owner, Maaz Hassan. If someone before you made a mess, open **Controls** and click **Reset demo**.

## The idea in one line

An AI agent can ask to spend. Code decides whether it may. PayPal moves the money. The model never touches the card, the PayPal token, or the price.

## Five things to try

### 1. Watch a prompt injection get blocked (30 seconds)

Open https://agentpurse.vercel.app/demo/injection.

The page shows a grocery listing with a hidden line that says to buy 5 gift cards instead. The user's real task is oat milk.

1. Click **Let Grocer follow the page**. The guard blocks it, because gift cards are not the task.
2. Click **Let Grocer follow the task**. The same page, with the real task, is allowed.

The guard compares every purchase with the user's original task. Text on a page is data, never an instruction.

### 2. Pay through PayPal, then hold a big payment for a human (1 minute)

Back on the purse, open **Agents**.

1. Under **Grocer**, pick **Buy oat milk and eggs from Green Grocer for $18.40** and click **Ask the clerk**. The clerk allows it, and PayPal charges the linked sandbox wallet with Orders v2.
2. Under **Wayfinder**, pick **Hold a $75 seat from Metro Rail** and click **Ask the clerk**. It is over the $50 line, so it is **held**.
3. Open **Approvals** and click **Approve and pay**. Only the owner can sign. An agent key cannot.
4. Open **Receipts**. Each payment shows its PayPal order id and capture id. Click **Refund** on one to send a real sandbox refund.

### 3. Watch the clerk say no (30 seconds)

Still under **Agents**:

- **Wayfinder:** **Book a $900 flight to Lisbon on SkyAir**. Denied: it is above the allowance.
- **Grocer:** **Buy a $40 charger from Unknown Gadgets**. Denied: Grocer may only buy groceries.
- **Handy:** **Buy $10 from Lucky Chips**. Denied: the store is on the blocklist.

Every decision comes with a plain-English sentence that names the rule that fired. The clerk is ordinary TypeScript (`src/policy/engine.ts`), not a model.

### 4. Shop real offers with Channel3 (1 minute)

Open **Shop** and search for `usb-c charger`.

- Results come from Channel3, with real offers from several stores.
- Click **Ask the clerk** on an offer. The server reads the price from Channel3 itself. An agent can never name its own price, and the price is checked again at payment.
- Click **Watch** to set a target price. When Channel3 reports a drop, the agent files a normal request, and the clerk rules on it like any other.

PayPal sandbox settles each payment with a stand-in merchant. **No retailer order is placed**, because Channel3 checkout is not live yet.

### 5. Pull the kill switches (30 seconds)

Open **Controls**.

- **Pause agent** stops one agent.
- **Panic freeze** stops every payment at once. Try a purchase and see it denied. Click **Clear panic freeze** to undo.
- **Revoke PayPal** deletes the vault payment token at PayPal, not just a local flag. To restore it, click **Reset demo**.

## Bonus: be the agent yourself (MCP)

Every agent connects over MCP with its own API key. Paste this in a terminal:

```bash
curl -s https://agentpurse.vercel.app/mcp \
  -H "Authorization: Bearer agpk_grocer_demo_maaz" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"request_purchase","arguments":{"text":"Buy oat milk from Green Grocer for $2.55","originalTask":"Buy oat milk"}}}'
```

To list all 16 tools, use `"method":"tools/list"` instead. Four come from the **PayPal Agent Toolkit**: `paypal_get_order`, `paypal_list_transactions`, `paypal_list_disputes`, and `paypal_get_dispute`. They only read data. Ask for a toolkit tool that moves money, such as `create_order`, and you are refused and sent to `request_purchase`. Demo keys:

| Agent | Key | Allowance |
| --- | --- | --- |
| Grocer | `agpk_grocer_demo_maaz` | $80, groceries |
| Wayfinder | `agpk_wayfinder_demo_maaz` | $400, travel |
| Stack | `agpk_stack_demo_maaz` | $40, software |
| Handy | `agpk_handy_demo_maaz` | $200, electronics and shopping |

To add the purse to Claude Desktop, Cursor, or Grok, see `docs/PLUGIN.md`.

## Run it on your own machine

No keys and no network. PayPal, AI, and Channel3 all run in mock mode and follow the same steps as the sandbox.

```bash
git clone https://github.com/maaz-bin-hassan/agentpurse.git
cd agentpurse
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000/purses/purse_maaz and repeat the steps above.

## Where the PayPal code lives

| PayPal API | File |
| --- | --- |
| OAuth token | `src/paypal/live.ts` |
| Vault v3: setup tokens and payment tokens (link a wallet with no purchase) | `src/paypal/live.ts` |
| Vault v3: delete the payment token (Revoke) | `src/paypal/live.ts` |
| Orders v2: create with `vault_id`, then capture. The intent id rides in `custom_id` | `src/paypal/live.ts` |
| Refund a capture | `src/paypal/live.ts` |
| PayPal Agent Toolkit: read-only tools, money-moving tools refused | `src/paypal/toolkit.ts`, `src/mcp/protocol.ts` |
| Verify webhook signatures (`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`) | `src/paypal/live.ts`, `app/api/paypal/webhooks` |

## Something not working?

- Click **Reset demo** under **Controls**.
- Check https://agentpurse.vercel.app/api/health.
- Run it locally with the commands above. Mock mode needs nothing external.
- Sandbox client credentials are not in the repo, and the hosted demo does not need them. Contact MaAz through Devpost if you want to run `PAYPAL_MODE=live` yourself. They stay available through 15 December 2026.
