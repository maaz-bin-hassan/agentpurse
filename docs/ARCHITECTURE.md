# Architecture

AgentPurse is the purse an AI agent spends from. The payer links PayPal once. Each agent has its own allowance, API key, and policy. A purchase is a merchant-initiated PayPal charge from that vaulted wallet to the merchant. AgentPurse does not hold the money.

Judges run `PAYPAL_MODE=mock` and `AI_MODE=mock` with no accounts. Set `DATABASE_URL` to a Supabase Postgres URL when you want the hosted database. Unset, the app uses SQLite.

```mermaid
flowchart LR
  Agent[MCP agent] --> Guard[Intent guard]
  Guard -->|block| Ledger[Intent and audit]
  Guard -->|pass| Clerk[Purse clerk]
  Clerk -->|deny| Ledger
  Clerk -->|hold| Human[Owner signs on the dashboard]
  Human --> Clerk
  Clerk -->|allow| Vault[PayPal vault charge]
  Vault --> Webhook[Signed webhook]
  Webhook --> Receipt[Receipt]
```

## Money

An allowance is a ledger cap on one agent. Raising it does not call PayPal. Spent amount is the sum of capture receipts minus refund receipts.

A charge uses Orders v2:

- `payment_source.paypal.vault_id` from Payment Method Tokens v3
- No `payee` and no `stored_credential` on a live wallet charge. PayPal refused the charge with both set (`BILLING_AGREEMENT_NOT_FOUND`), and accepted it without them. The payment goes to the business account that owns the REST app
- `purchase_units[0].custom_id` is the intent id

The vault itself is created with no purchase: setup token, payer approval, payment token. Revoke calls `DELETE /v3/vault/payment-tokens/{id}`.

Above the approval line, nothing is captured until a WebAuthn assertion succeeds, or the payer approves a customer-present PayPal order (the fallback link).

## Decisions the model is not allowed to make

- Whether a payment is permitted
- Whether a cap, allowance, denylist, pause, or panic is waived
- Whether a page that disagrees with the user's task is safe
- The wording of the official reason

The model may propose an intent or a policy JSON document. Zod checks the policy. Amounts in an intent must appear in the sentence. Catalog merchants keep their category. The guard and the clerk run after that, in code.

## Intent guard

Inputs are the user's original task, the proposed merchant and amount, and any page text the agent was reading. The guard extracts hidden instructions (for example "buy 5 gift cards") and blocks when the proposal is not the task. A live model may also flag a block. It cannot clear a block the deterministic signals already raised.

## Clerk

`evaluateSpend` is pure. Order:

1. Owner panic freeze
2. Paused or revoked agent
3. Incomplete intent
4. Non-positive amount or wrong currency
5. Blocked merchant
6. Category the agent cannot spend
7. Over the per-payment cap
8. Over the remaining allowance
9. Over the daily cap
10. No vaulted PayPal wallet
11. Untrusted merchant, or amount at or above the approval line
12. Otherwise allow

Approval re-runs the deny rules before capture.

## MCP

`src/mcp` implements twelve tools. Shopping is `search_products`, `get_product`, `check_price`, `find_alternatives`, `watch_price`, `list_watches`, and `cancel_watch`. Paying is `search_merchants`, `get_quote`, `request_purchase`, `get_budget`, and `list_receipts`. Stdio is `npm run mcp` and reads `AGENTPURSE_API_KEY`. `POST /mcp` is streamable HTTP (protocol `2025-11-25`): JSON-RPC in, JSON or an accepted notification response out, bearer API key or OAuth access token, Origin rejected when it is present and not allowed.

Agent API keys are the working sign-in. Client registration, token exchange, and OAuth metadata exist, but there is no authorization page yet, so a remote OAuth client cannot finish signing in.

## Catalog purchases

Channel3 finds products. It cannot place orders yet, because its checkout is still "coming soon", and its offers carry no PayPal payee. So a catalog purchase works like this:

1. An agent calls `search_products`. `src/channel3` calls `POST /v1/search`. Listing descriptions never reach the agent, and suspicious listings are flagged.
2. `get_quote` takes a product id and a domain. `readOffer` reads the price with `GET /v1/products/{id}` and converts it to integer cents in `priceToCents`. An agent cannot supply a price.
3. `request_purchase` reads the price again. The guard checks the listing for hidden instructions and compares the product with the task. A rise of any size is denied by the clerk as `price_moved`.
4. A first-time retailer is an untrusted merchant, so it holds for the owner. The price is read a third time when the owner signs.
5. PayPal charges the vaulted wallet in the sandbox and pays the app's business account, which stands in for the retailer. **No retailer order is placed.** The reply, the receipt, and the dashboard say so, and show the buy link.

## Price watches

`watch_price` calls `POST /v1/product-subscriptions` for `offer.price.changed`. Webhooks arrive at `/api/channel3/webhooks`, and are checked against the Standard Webhooks signature and a five-minute window, then deduped.

The event only wakes the watch. `checkWatch` reads the price from Channel3 again, never from the event. At or under target, it claims the watch once and files a normal purchase with the original task. The clerk decides, so a watch has no special powers: pause, panic, caps, and holds all apply.

## Databases

One SQL dialect, two drivers. `?` placeholders are rewritten to `$1` for Postgres. Booleans are integers. Timestamps are ISO-8601 text. `supabase/migrations` is what a Supabase project applies. Tests run the Postgres statements on PGlite and the default suite on SQLite.

## Modes

| Variable | Default | Effect |
| --- | --- | --- |
| `PAYPAL_MODE` | `mock` | Vault, orders, and webhooks in process |
| `PAYPAL_MODE` | `live` | `api-m.sandbox.paypal.com` |
| `CHANNEL3_MODE` | `mock` | Fictional catalog with no key. `live` calls Channel3 |
| `AI_MODE` | `mock` | Local parser, compiler, and guard |
| `DATABASE_URL` | unset | SQLite at `data/agentpurse.db` |
| `AGENTPURSE_AUTO_SEED` | on | Seed Maaz when there is no owner |
