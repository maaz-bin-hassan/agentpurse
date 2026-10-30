# AgentPurse

A checkbook AI agents spend from. The agent writes a sentence. A deterministic purse clerk allows the payment, holds it for a human, or denies it. PayPal is the rail. The model may read the sentence. It does not move the money.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Default mode is `PAYPAL_MODE=mock`: the whole demo runs with no PayPal, model, or database account.

## For judges

You can review this without creating a PayPal sandbox account.

```bash
npm install
npm test
npm run seed
npm run dev
```

Then open http://localhost:3000. `GET /api/health` reports `paypalMode: "mock"` and `credentialsRequired: false`.

What you are judging:

- **PayPal** is integrated as an Orders v2 client (`create`, buyer `approve`, `capture`, `refund`). The mock stores those orders in SQLite and enforces the same transitions. `src/paypal/live.ts` is the sandbox adapter, used only when `PAYPAL_MODE=live`.
- **AI** parses a spend sentence into a merchant, an amount, and a category. With `AI_MODE=mock` (the default) that parser is local and deterministic. A live Groq or Gemini key is optional. Code still checks the amount against the sentence.
- **The clerk** is ordinary TypeScript. Caps, envelopes, denylist, balance, and the approval line are not model opinions.

The click-by-click script is `docs/DEMO.md` (added with the dashboard). Paste-ready Devpost copy is `docs/DEVPOST.md`.

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
