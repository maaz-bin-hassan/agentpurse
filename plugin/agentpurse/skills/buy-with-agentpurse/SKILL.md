---
name: buy-with-agentpurse
description: Buy something for the user from their AgentPurse when they ask to purchase, order, or pay.
---

# Buy with AgentPurse

Use this when the user asks to buy or pay for something.

1. Call `get_budget` and pick the agent whose categories match the request.
2. Call `search_merchants` if the store is unclear.
3. Call `get_quote` with the user's words as `originalTask`. Do not invent a different merchant or amount.
4. If the quote's guard is `block`, stop and tell the user. Do not retry with the blocked merchant.
5. Call `request_purchase` with the quote id. If the status is `pending_approval`, tell the user to confirm with their passkey or the PayPal approval link. Do not claim the payment happened.
6. If the status is `captured`, read `list_receipts` and show the merchant, amount, and receipt id.
7. Never ask to raise an allowance, clear a panic freeze, or revoke PayPal. Those belong to the user.
