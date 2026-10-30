# Demo script

No PayPal account, model key, or Supabase project. The app defaults to `PAYPAL_MODE=mock` and `AI_MODE=mock`.

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000. The first boot also seeds the demo when the database is empty.

## What is already in the book

Maya Chen's household purse is at **$238.00**.

- A $250.00 PayPal top-up was captured.
- Stack paid CloudApps **$12.00** from the Software envelope.
- Wayfinder tried to book a **$900.00** SkyAir flight. The clerk denied it. The ledger names the per-payment cap, the Travel envelope, the daily cap, and the balance. No PayPal order was created for that flight.

Caps: **$150** per payment, **$300** per day, a human at **$50**. Envelopes: Groceries $80 this week, Travel $400 this month, Software $40 this month, Household $100 this month.

## Click path

1. Open **Maya's Household**.
2. Read the clerk's latest line. It is the SkyAir denial.
3. Under Grocer, leave the oat-milk sentence and click **Ask the clerk**.
   - Expected: **Allow.** "Paid Green Grocer $18.40 from the Groceries envelope." Balance becomes **$219.60**.
4. Under Wayfinder, choose **Buy Metro Rail tickets for $42** and ask the clerk.
   - Expected: **Allow.** Trusted merchant, under the $50 line. Balance becomes **$177.60**.
5. Choose **Hold a $75 seat from Metro Rail** and ask the clerk.
   - Expected: **Hold.** The amount is on the approval line. Balance does not move. The hold appears under "Waiting on Maya Chen."
6. Click **Approve and pay**.
   - Expected: the seat is captured and the balance becomes **$102.60**.
7. Choose **Book a $900 flight to Lisbon on SkyAir**.
   - Expected: **Deny.** The explanation lists the caps. Balance unchanged.
8. Under Grocer, choose the charger sentence.
   - Expected: **Deny.** Grocer cannot spend on electronics.
9. Under Handy, ask for the **$30 charger from Unknown Gadgets**.
   - Expected: **Hold**, because Unknown Gadgets is not trusted. Approve it, or deny it.
10. Ask Handy to **Buy $10 from Lucky Chips**.
    - Expected: **Deny.** Lucky Chips is blocked.
11. In **Captured, still refundable**, refund the Green Grocer payment.
    - Expected: **$18.40** returns to the balance and to the Groceries envelope.
12. Top up **100**. Click **Create order**, then **Approve**, then **Capture**.
    - Expected: the order moves Created → Approved → Captured and the balance rises by **$100.00**.

## Curl the same story

```bash
curl -s http://localhost:3000/api/health
curl -s -X POST http://localhost:3000/api/agents/agent_grocer/spend \
  -H 'content-type: application/json' \
  -d '{"text":"Buy oat milk and eggs from Green Grocer for $18.40"}'
```

`/api/health` reports `paypalMode: "mock"` and `credentialsRequired: false`.

## What is mocked

- PayPal Orders v2 state lives in SQLite. The buttons are the buyer approval and the capture.
- The intent parser is local. Set `AI_MODE=live` plus `GROQ_API_KEY` or `GEMINI_API_KEY` only if you want a model to propose the intent. The amount still has to appear in the sentence, and the clerk still decides.
- Set `PAYPAL_MODE=live` plus sandbox client id and secret only when you want `src/paypal/live.ts` to call `api-m.sandbox.paypal.com`. Leave it unset for the demo.
