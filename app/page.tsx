import Link from "next/link";
import { getDb } from "@/src/db/connection";
import { formatMoney } from "@/src/domain/money";
import { listPurseSummaries } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function HomePage() {
  const purses = listPurseSummaries(getDb());

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
      <p className="eyebrow">A checkbook for agents</p>
      <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 4.6rem)", margin: "8px 0 0" }}>
        The purse your agents spend from.
      </h1>
      <hr className="rule" />
      <p className="lede">
        An agent asks in a sentence. The purse clerk allows it, holds it for a human, or says no.
        PayPal moves the money only after the clerk agrees. This demo needs no sandbox key.
      </p>
      <section className="steps">
        <article className="panel">
          <p className="eyebrow">1 · Propose</p>
          <h2>The agent writes a sentence.</h2>
          <p className="muted">A parser reads the merchant, the amount, and the category. It does not get a vote.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">2 · Dispose</p>
          <h2>The clerk applies the rules.</h2>
          <p className="muted">Envelopes, caps, the denylist, the balance, and an approval line. Ordinary code.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">3 · Settle</p>
          <h2>PayPal captures the order.</h2>
          <p className="muted">Create, buyer approval, capture. In mock mode the whole path stays on this machine.</p>
        </article>
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Purses</h2>
        {purses.length === 0 ? (
          <p>No purses yet. Run <code>npm run seed</code> and reload.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Purse</th>
                <th>Owner</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {purses.map((purse) => (
                <tr key={purse.id}>
                  <td>
                    <Link href={`/purses/${purse.id}`}>{purse.name}</Link>
                  </td>
                  <td>{purse.ownerName}</td>
                  <td className="num money">{formatMoney(purse.balanceCents, purse.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
