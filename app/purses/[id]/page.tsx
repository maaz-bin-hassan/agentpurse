import Link from "next/link";
import { notFound } from "next/navigation";
import { AllowanceForm } from "@/components/AllowanceForm";
import { HoldActions } from "@/components/HoldActions";
import { RefundButton } from "@/components/RefundButton";
import { SpendForm } from "@/components/SpendForm";
import { getDb } from "@/src/db/connection";
import { DEMO_KEYS } from "@/src/db/seed";
import { formatMoney } from "@/src/domain/money";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAMPLES: Record<string, string[]> = {
  agent_grocer: ["Buy oat milk and eggs from Green Grocer for $18.40", "Buy a $40 charger from Unknown Gadgets"],
  agent_wayfinder: ["Buy Metro Rail tickets for $42", "Hold a $75 seat from Metro Rail", "Book a $900 flight to Lisbon on SkyAir"],
  agent_stack: ["Pay CloudApps $9 for extra storage"],
  agent_handy: ["Buy a $30 charger from Unknown Gadgets", "Buy $10 from Lucky Chips"],
};

export default async function PursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadHousehold(await getDb(), id);
  if (!view) notFound();
  const { owner, vault, agents, holds, captured, receipts, latest } = view;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Agent<span>Purse</span>
        </Link>
        <Link href="/">All households</Link>
      </header>
      <p className="eyebrow">{owner.email}</p>
      <h1 style={{ margin: "6px 0 0" }}>{owner.name}'s household</h1>
      <hr className="rule" />
      <div className="grid-2">
        <section className="panel">
          <p className="muted" style={{ marginTop: 0 }}>
            PayPal wallet
          </p>
          <p className="balance" style={{ fontSize: "2rem" }}>
            {vault?.status === "vaulted" ? "Linked" : "Not linked"}
          </p>
          <p className="muted">
            {vault?.paymentTokenId ?? "No payment token"} · AgentPurse does not hold a balance.
            {owner.panicFrozen ? " Panic freeze is on." : ""}
          </p>
          <h2>Allowances</h2>
          {agents.map((agent) => (
            <div key={agent.id} style={{ marginBottom: 16 }}>
              <div className="row">
                <strong>{agent.name}</strong>
                <span className="money">{formatMoney(agent.remainingCents)} left</span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-label={`${agent.name} allowance used`}
                aria-valuemin={0}
                aria-valuemax={agent.allowanceCents}
                aria-valuenow={agent.spentCents}
              >
                <span style={{ width: `${agent.allowanceCents === 0 ? 0 : Math.min(100, (agent.spentCents / agent.allowanceCents) * 100)}%` }} />
              </div>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {formatMoney(agent.spentCents)} spent of {formatMoney(agent.allowanceCents)} · {agent.allowedCategories.join(", ")} · {agent.provider}
              </p>
              <AllowanceForm agentId={agent.id} agentName={agent.name} />
            </div>
          ))}
        </section>
        <div className="stack">
          <section className="panel">
            <p className="eyebrow">Purse clerk</p>
            <blockquote className="clerk">{latest?.detail ?? "The book is empty."}</blockquote>
          </section>
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Waiting on {owner.name}</h2>
            {holds.length === 0 ? (
              <p className="muted">Nothing is held.</p>
            ) : (
              <div className="stack">
                {holds.map((hold) => (
                  <HoldActions key={hold.id} spendId={hold.id} title={hold.merchantName ?? "Request"} explanation={hold.explanation ?? hold.rawText} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Agents</h2>
        {agents.map((agent) => (
          <div key={agent.id}>
            <SpendForm
              agentId={agent.id}
              agentName={agent.name}
              description={`${agent.description} Demo key ${DEMO_KEYS[agent.id as keyof typeof DEMO_KEYS] ?? agent.apiKeyPrefix}.`}
              samples={SAMPLES[agent.id] ?? [`Pay a merchant $10 for ${agent.allowedCategories[0] ?? "a bill"}`]}
            />
          </div>
        ))}
      </section>
      {captured.length > 0 ? (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Captured, still refundable</h2>
          <div className="stack">
            {captured.map((intent) => (
              <RefundButton
                key={intent.id}
                spendId={intent.id}
                label={`${intent.merchantName ?? "Payment"} · ${formatMoney(intent.amountCents ?? 0)}`}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Receipts</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Merchant</th>
              <th>Kind</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td className="muted">{receipt.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <strong>{receipt.merchantName}</strong>
                  <div className="muted">{receipt.detail}</div>
                </td>
                <td>{receipt.kind}</td>
                <td className="num money">
                  {receipt.kind === "refund" ? "+" : "−"}
                  {formatMoney(receipt.amountCents, receipt.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
