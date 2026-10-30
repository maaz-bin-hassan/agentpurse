# AgentPurse

A checkbook AI agents spend from. The agent writes a sentence. A deterministic purse clerk allows the payment, holds it for a human, or denies it. PayPal is the rail. The model may read the sentence. It does not move the money.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Default mode is `PAYPAL_MODE=mock`: the whole demo runs with no PayPal, model, or database account.

## For judges

You can review this without creating a PayPal sandbox account, a model key, or a Supabase project.

```bash
npm install
npm test
npm run seed
npm run dev
```

Open http://localhost:3000 and then http://localhost:3000/purses/purse_maya. The first boot seeds Maya Chen's household if the database is empty. `GET /api/health` reports `paypalMode: "mock"` and `credentialsRequired: false`.

What you are judging:

- **PayPal** is an Orders v2 client: create, buyer approve, capture, refund. Mock mode stores those orders in SQLite and refuses illegal transitions (capture before approve, double capture, refund before capture). `src/paypal/live.ts` calls the sandbox only when `PAYPAL_MODE=live` and keys are present.
- **AI** turns a sentence into a merchant, an amount, and a category. `AI_MODE=mock` (the default) does that locally. Groq or Gemini are optional. An amount the model invents is discarded, and a known merchant keeps the category from the catalog.
- **The clerk** is ordinary TypeScript. Envelopes, caps, the denylist, the balance, and the $50 approval line are not model opinions. A denied payment never creates a PayPal order.

Three-minute path, also written as `docs/DEMO.md`:

1. Read the clerk's line. Wayfinder already tried to book a $900 SkyAir flight and was denied.
2. Ask Grocer to buy oat milk from Green Grocer for $18.40. That captures.
3. Ask Wayfinder to hold a $75 Metro Rail seat. That waits for Maya. Approve it.
4. Ask Grocer to buy a charger. That is denied, because Grocer cannot spend on electronics.
5. Refund the oat milk, or top up $100 through Create → Approve → Capture.

Paste-ready submission text is in `docs/DEVPOST.md`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest. No network. |
| `npm run seed` | Loads Maya Chen's household into the local database. Safe to repeat. |
| `npm run dev` | Next.js on port 3000. Seeds the demo if the database is empty. |
| `npm run build` | Production build. |

## Environment

Copy `.env.example` only if you want to change defaults. Unset means mock.

| Variable | Default | Role |
| --- | --- | --- |
| `PAYPAL_MODE` | `mock` | `live` calls the PayPal sandbox |
| `AI_MODE` | `mock` | `live` calls Groq or Gemini for intent only |
| `AGENTPURSE_DB` | `data/agentpurse.db` | SQLite file |
| `AGENTPURSE_AUTO_SEED` | on | Set to `0` to skip the demo seed |

## License

MIT. See `LICENSE`.
