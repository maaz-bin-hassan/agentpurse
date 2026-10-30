import Link from "next/link";
import { notFound } from "next/navigation";
import { HoldActions } from "@/components/HoldActions";
import { RefundButton } from "@/components/RefundButton";
import { SpendForm } from "@/components/SpendForm";
import { TopUp } from "@/components/TopUp";
import { getDb } from "@/src/db/connection";
import { formatMoney } from "@/src/domain/money";
import { periodLabel } from "@/src/domain/period";
import { loadPurseView } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAMPLES: Record<string, string[]> = {
  agent_grocer: [
    "Buy oat milk and eggs from Green Grocer for $18.40",
    "Buy a $40 charger from Unknown Gadgets",
  ],
  agent_wayfinder: [
    "Buy Metro Rail tickets for $42",
    "Hold a $75 seat from Metro Rail",
    "Book a $900 flight to Lisbon on SkyAir",
  ],
  agent_stack: ["Pay CloudApps $9 for extra storage"],
  agent_handy: ["Buy a $30 charger from Unknown Gadgets", "Buy $10 from Lucky Chips"],
};

function effectLabel(effect: "credit" | "debit" | "none", amountCents: number | null, currency: string): string {
  if (amountCents == null) return "—";
  if (effect === "none") return formatMoney(amountCents, currency);
  const prefix = effect === "credit" ? "+" : "−";
  return `${prefix}${formatMoney(amountCents, currency)}`;
}

export default async function PursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = loadPurseView(getDb(), id);
  if (!view) notFound();
  const { purse, envelopes, agents, holds, captured, ledger, latest } = view;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Agent<span>Purse</span>
        </Link>
        <Link href="/">All purses</Link>
      </header>
      <p className="eyebrow">{purse.ownerName}</p>
      <h1 style={{ margin: "6px 0 0" }}>{purse.name}</h1>
      <hr className="rule" />
      <div className="grid-2">
        <section className="panel">
          <p className="muted" style={{ marginTop: 0 }}>
            Available
          </p>
          <p className="balance money">{formatMoney(purse.balanceCents, purse.currency)}</p>
          <p className="muted">
            {formatMoney(purse.perTxnCapCents, purse.currency)} per payment ·{" "}
            {formatMoney(purse.dailyCapCents, purse.currency)} per day · approval at{" "}
            {formatMoney(purse.approvalThresholdCents, purse.currency)}
          </p>
          <h2>Envelopes</h2>
          {envelopes.map((envelope) => {
            const width = envelope.limitCents === 0 ? 0 : Math.min(100, (envelope.spentCents / envelope.limitCents) * 100);
            return (
              <div key={envelope.id} style={{ marginBottom: 14 }}>
                <div className="row">
                  <strong>{envelope.name}</strong>
                  <span className="money">
                    {formatMoney(envelope.remainingCents, purse.currency)} left {periodLabel(envelope.period)}
                  </span>
                </div>
                <div
                  className="meter"
                  role="meter"
                  aria-label={`${envelope.name} spent`}
                  aria-valuemin={0}
                  aria-valuemax={envelope.limitCents}
                  aria-valuenow={envelope.spentCents}
                >
                  <span style={{ width: `${width}%` }} />
                </div>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {formatMoney(envelope.spentCents, purse.currency)} of {formatMoney(envelope.limitCents, purse.currency)} ·{" "}
                  {envelope.category}
                </p>
              </div>
            );
          })}
        </section>
        <div className="stack">
          <section className="panel">
            <p className="eyebrow">Purse clerk</p>
            <blockquote className="clerk">{latest?.detail ?? "The book is empty."}</blockquote>
          </section>
          <section className="panel">
            <TopUp purseId={purse.id} />
          </section>
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Waiting on {purse.ownerName}</h2>
            {holds.length === 0 ? (
              <p className="muted">Nothing is held.</p>
            ) : (
              <div className="stack">
                {holds.map((hold) => (
                  <HoldActions
                    key={hold.id}
                    spendId={hold.id}
                    title={hold.merchantName ?? "Request"}
                    explanation={hold.explanation ?? hold.rawText}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Agents</h2>
        {agents.map((agent) => (
          <SpendForm
            key={agent.id}
            agentId={agent.id}
            agentName={agent.name}
            description={agent.description}
            samples={SAMPLES[agent.id] ?? [`Pay a merchant $10 for ${agent.allowedCategories[0] ?? "a bill"}`]}
          />
        ))}
      </section>

      {captured.length > 0 ? (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Captured, still refundable</h2>
          <div className="stack">
            {captured.map((spend) => (
              <RefundButton
                key={spend.id}
                spendId={spend.id}
                label={`${spend.merchantName ?? "Payment"} · ${formatMoney(spend.amountCents ?? 0, spend.currency ?? purse.currency)}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Ledger</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Entry</th>
              <th>Decision</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id}>
                <td className="muted">{row.at.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <strong>{row.title}</strong>
                  <div className="muted">{row.detail}</div>
                </td>
                <td>
                  <span className={`chip ${row.tone}`}>
                    {row.tone === "allow" ? "Allow" : row.tone === "deny" ? "Deny" : row.tone === "hold" ? "Hold" : "Note"}
                  </span>
                </td>
                <td className="num money">{effectLabel(row.effect, row.amountCents, purse.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
