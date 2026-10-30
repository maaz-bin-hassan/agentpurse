import Link from "next/link";
import { getDb } from "@/src/db/connection";
import { listHouseholds } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const households = await listHouseholds(await getDb());

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Agent<span>Purse</span>
        </Link>
        <p className="muted" style={{ margin: 0 }}>
          PayPal mock mode
        </p>
      </header>
      <p className="eyebrow">Agentic commerce</p>
      <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 4.6rem)", margin: "8px 0 0" }}>
        The purse your agents spend from.
      </h1>
      <hr className="rule" />
      <p className="lede">
        Each agent has its own allowance and API key. PayPal is linked once, then a merchant-initiated charge
        pays the store. AgentPurse never holds the money.
      </p>
      <section className="steps">
        <article className="panel">
          <p className="eyebrow">1 · Link</p>
          <h2>Vault PayPal without a purchase.</h2>
          <p className="muted">A setup token becomes a payment token. Later charges use that vault id.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">2 · Ask</p>
          <h2>The clerk still decides.</h2>
          <p className="muted">Allowances, caps, and the denylist are code. A model cannot waive them.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">3 · Pay the merchant</p>
          <h2>Orders v2, then a receipt.</h2>
          <p className="muted">The charge names the merchant as payee. The intent id rides in custom_id.</p>
        </article>
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Households</h2>
        {households.length === 0 ? (
          <p>No household yet. Run <code>npm run seed</code> and reload.</p>
        ) : (
          <ul>
            {households.map((owner) => (
              <li key={owner.id}>
                <Link href={`/purses/${owner.id}`}>{owner.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
