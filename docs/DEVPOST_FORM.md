# Devpost form answers

Paste each block into the matching field. Fields marked "you choose" are personal answers.

---

## General info

**Project name** (60 max)

```
AgentPurse
```

**Elevator pitch** (200 max, this is 171)

```
A checkbook for AI agents. Agents ask to spend in plain English; a code clerk allows, holds, or denies; PayPal pays from your saved wallet. The agent never sees your card.
```

**Thumbnail:** upload `docs/devpost/thumbnail.png`.

---

## Project Story: About the project

Paste the code block under **Project story** in `docs/DEVPOST.md`. It is the single source for the story, so edit it there.

---

## Built with (type each, press Enter)

```
paypal
paypal-orders-v2
paypal-vault
paypal-webhooks
paypal-sandbox
channel3
mcp
grok
claude
groq
gemini
deepseek
next.js
typescript
react
node.js
postgresql
supabase
sqlite
vercel
zod
vitest
tailwindcss
```

---

## "Try it out" links

```
https://agentpurse.vercel.app/purses/purse_maaz
```

Click ADD ANOTHER LINK, then:

```
https://github.com/maaz-bin-hassan/agentpurse
```

## Image gallery

Upload in this order:

1. `docs/devpost/thumbnail.png`
2. `docs/devpost/gallery-2-flow.png`
3. `docs/devpost/gallery-3-guards.png`
4. Then 3–4 screenshots of your own: the household page, a held cheque, the injection block, and Channel3 shop results.

## Video demo link

```
https://youtu.be/-5Y8ftuzQG4
```

The rules say the video must be publicly visible on YouTube and under 3 minutes. Set it to Public, not Unlisted.

---

## Additional info (judges only)

**Upload a File:** leave empty.

**Submitter Type:** you choose (Individual if you're entering alone).

**Submitter Country of Residence:** you choose.

**Canada province:**

```
N/A
```

**Organization Name:**

```
N/A
```

**Is your project new, or did it exist before Oct 1, 2026?** New. The first commit is 2026-10-30.

**If it existed before, explain…**

```
N/A
```

**Explain how your project meets the main technology requirement.**

```
PayPal (sandbox, live on the hosted demo):
- PayPal Payment Method Tokens v3 (Vault): the payer links their PayPal wallet once. AgentPurse stores only the payment token, never a card number, and holds no balance.
- PayPal Orders v2: each allowed purchase creates and captures an order against the saved wallet using vault_id, paying the merchant's PayPal business account. The AgentPurse intent id is sent as custom_id so every payment traces back to the agent's sentence.
- Refunds: captures can be refunded from the dashboard.
- Webhooks: PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED events are signature-verified before they become receipts.
- Revoke: the kill switch deletes the vault payment token at PayPal.

AI:
- AI agents are the users of the product: Grok Bot, Claude, and Cursor connect over our MCP server (stdio and streamable HTTP) with their own API key and allowance, search products, and ask to pay in plain English.
- Intent parsing: a model turns the agent's sentence into a structured request. The hosted demo runs AI_MODE=live with DeepSeek (deepseek-chat); Groq (Llama 3.3 70B) and Google Gemini 2.5 Flash are also supported. Code validates the JSON and rejects any amount that is not written in the sentence. With no model key, a built-in local parser does the same job, so the repo runs offline.
- Intent guard: every purchase is compared with the user's original task, and hidden instructions in pages or listings are blocked.

The AI never moves money. A deterministic clerk in code allows, holds, or denies, and PayPal does the paying.
```

**Which additional sponsor tool(s) did you use?** Select **Channel3**.

**Public code repository URL**

```
https://github.com/maaz-bin-hassan/agentpurse
```

**Working demo URL**

```
https://agentpurse.vercel.app
```

**Testing instructions or credentials**

```
No login needed. Full 5-minute walkthrough: https://github.com/maaz-bin-hassan/agentpurse/blob/main/docs/JUDGES.md

HOSTED DEMO (real PayPal sandbox, live Channel3, live AI)
Open https://agentpurse.vercel.app/purses/purse_maaz. You get a demo session as the owner, Maaz Hassan. A PayPal sandbox wallet is already linked. If anything looks off, open Controls and click Reset demo.

1. Prompt injection: open https://agentpurse.vercel.app/demo/injection. Click "Let Grocer follow the page" (blocked: hidden gift-card order), then "Let Grocer follow the task" (allowed: oat milk).
2. PayPal payment: Agents > Grocer > "Buy oat milk and eggs from Green Grocer for $18.40" > Ask the clerk. PayPal charges the sandbox wallet. Receipts shows the PayPal order and capture ids, with a Refund button.
3. Human approval: Agents > Wayfinder > "Hold a $75 seat from Metro Rail" > Ask the clerk (held, over $50). Approvals > Approve and pay.
4. Denials: Wayfinder "Book a $900 flight to Lisbon on SkyAir" (over the allowance). Handy "Buy $10 from Lucky Chips" (blocked store).
5. Shopping: Shop > search "usb-c charger" > Ask the clerk or Watch. Prices come from Channel3, never from the agent. No retailer order is placed: sandbox settles with a stand-in merchant.
6. Kill switches: Controls > Panic freeze, Revoke PayPal (deletes the vault token at PayPal), then Reset demo.

BE THE AGENT (MCP)
curl -s https://agentpurse.vercel.app/mcp -H "Authorization: Bearer agpk_grocer_demo_maaz" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"request_purchase","arguments":{"text":"Buy oat milk from Green Grocer for $2.55","originalTask":"Buy oat milk"}}}'

Demo agent keys (sandbox money only): Grocer agpk_grocer_demo_maaz, Wayfinder agpk_wayfinder_demo_maaz, Stack agpk_stack_demo_maaz, Handy agpk_handy_demo_maaz. Setup for Claude, Cursor, and Grok: docs/PLUGIN.md.

RUN LOCALLY (no keys, no network: mock PayPal, AI, and Channel3)
git clone https://github.com/maaz-bin-hassan/agentpurse.git
cd agentpurse
npm install
npm test
npm run seed
npm run dev
Open http://localhost:3000/purses/purse_maaz.

Sandbox client credentials are not in the repo, and the hosted demo does not need them. They are available on request through 15 December 2026.
```

**How would you rate your overall experience integrating PayPal?** You choose (1–10).

**Overall experience rating: why** (draft, edit to your own view)

```
The sandbox made it possible to test the full agent payment loop end to end: vault a wallet, charge it with Orders v2 using vault_id, refund, and receive signed webhooks. Payment Method Tokens v3 fit agents well, because the agent is never the payer at checkout. The main friction was understanding which vault flow supports merchant-initiated charges without a buyer present, and confirming webhook delivery in the sandbox, which can lag behind the capture by a few seconds.
```

**Are you open to us contacting you for feedback?** You choose.

**APIMatic Context Plugin experience:** leave empty unless you used it.

**AG Grid experience:** leave empty.

**Checkboxes (age, eligible jurisdiction, not an employee):** tick them only if they are true for you.

**Which AI tools have you leveraged while working on this project?** (add any others you used)

```
Cursor (cloud agents on Grok 4.7) and Claude Code (Anthropic) for pair programming, tests, debugging the live deployment, and building the demo video with Remotion. Grok Bot as an MCP client to run real purchases against the live purse. ElevenLabs for the video voiceover. DeepSeek (live on the hosted demo), Groq (Llama 3.3 70B), and Google Gemini 2.5 Flash as the live intent-parsing models.
```

**Level of learning / AI value for your career:** you choose.
