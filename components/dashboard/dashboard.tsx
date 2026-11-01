"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Inbox, LayoutDashboard, Power, Receipt, Shield } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentFace } from "@/components/agents/faces";
import { AgentPause } from "@/components/AgentPause";
import { AllowanceForm } from "@/components/AllowanceForm";
import { Wordmark } from "@/components/brand/logo";
import { HoldActions } from "@/components/HoldActions";
import { HouseholdControls } from "@/components/HouseholdControls";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { StampBurst } from "@/components/motion/stamp-burst";
import { RefundButton } from "@/components/RefundButton";
import { SpendForm } from "@/components/SpendForm";
import { ThemeToggle } from "@/components/theme-toggle";
import { DEMO_KEYS } from "@/src/domain/demo-keys";
import { formatMoney } from "@/src/domain/money";

type Agent = {
  id: string;
  name: string;
  provider: string;
  description: string;
  status: string;
  allowanceCents: number;
  spentCents: number;
  remainingCents: number;
  allowedCategories: string[];
  approvalThresholdCents: number;
  apiKeyPrefix: string;
};

type Intent = {
  id: string;
  agentId: string;
  merchantName: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string;
  explanation: string | null;
  rawText: string;
  category: string | null;
  guardDecision: string | null;
  createdAt: string;
};

type Receipt = {
  id: string;
  agentId: string;
  merchantName: string;
  kind: "capture" | "refund";
  amountCents: number;
  currency: string;
  detail: string;
  createdAt: string;
};

export type DashboardData = {
  owner: { id: string; name: string; email: string; panicFrozen: boolean };
  vault: { status: string; paymentTokenId: string | null } | null;
  agents: Agent[];
  holds: Intent[];
  captured: Intent[];
  intents: Intent[];
  receipts: Receipt[];
  notifications: Array<{ id: string; title: string; body: string }>;
  latestDetail: string | null;
};

const NAV = [
  { id: "Overview", icon: LayoutDashboard },
  { id: "Agents", icon: Bot },
  { id: "Approvals", icon: Inbox },
  { id: "Receipts", icon: Receipt },
  { id: "Guard", icon: Shield },
  { id: "Controls", icon: Power },
] as const;
type Nav = (typeof NAV)[number]["id"];

const SAMPLES: Record<string, string[]> = {
  agent_grocer: ["Buy oat milk and eggs from Green Grocer for $18.40", "Buy a $40 charger from Unknown Gadgets"],
  agent_wayfinder: ["Buy Metro Rail tickets for $42", "Hold a $75 seat from Metro Rail", "Book a $900 flight to Lisbon on SkyAir"],
  agent_stack: ["Pay CloudApps $9 for extra storage"],
  agent_handy: ["Buy a $30 charger from Unknown Gadgets", "Buy $10 from Lucky Chips"],
};

const STAMPS: Record<string, { tone: string; label: string }> = {
  captured: { tone: "allow", label: "Paid" },
  refunded: { tone: "quiet", label: "Refunded" },
  pending_approval: { tone: "hold", label: "Held" },
  awaiting_paypal: { tone: "hold", label: "At PayPal" },
  denied: { tone: "deny", label: "Denied" },
  blocked: { tone: "deny", label: "Blocked" },
  needs_clarification: { tone: "quiet", label: "Unclear" },
};

export function Dashboard({ data }: { data: DashboardData }) {
  const reduce = useReducedMotion();
  const [section, setSection] = useState<Nav>("Overview");
  const [receiptKind, setReceiptKind] = useState<"all" | "capture" | "refund">("all");
  const [receiptAgent, setReceiptAgent] = useState("all");
  const [paid, setPaid] = useState(false);
  const { owner, vault, agents, holds, captured, intents, receipts, notifications, latestDetail } = data;

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const intent of intents) {
      if (intent.status !== "captured" && intent.status !== "refunded") continue;
      const key = intent.category ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + (intent.amountCents ?? 0));
    }
    return [...totals.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }, [intents]);
  const overTime = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const receipt of receipts) {
      const day = receipt.createdAt.slice(0, 10);
      const delta = receipt.kind === "refund" ? -receipt.amountCents : receipt.amountCents;
      byDay.set(day, (byDay.get(day) ?? 0) + delta);
    }
    const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return rows.map(([day, cents]) => ({ day: day.slice(5), dollars: cents / 100 }));
  }, [receipts]);

  const filteredReceipts = receipts.filter((receipt) => {
    if (receiptKind !== "all" && receipt.kind !== receiptKind) return false;
    if (receiptAgent !== "all" && receipt.agentId !== receiptAgent) return false;
    return true;
  });
  const blocked = intents.filter((intent) => intent.status === "blocked" || intent.guardDecision === "block");
  const agentName = (id: string) => agents.find((agent) => agent.id === id)?.name ?? "An agent";
  const totalLeft = agents.reduce((sum, agent) => sum + agent.remainingCents, 0);
  const totalSpent = agents.reduce((sum, agent) => sum + Math.max(0, agent.spentCents), 0);

  return (
    <div className="grid min-h-screen w-full grid-cols-[minmax(0,1fr)] md:grid-cols-[236px_minmax(0,1fr)]">
      <StampBurst show={paid} onDone={() => setPaid(false)} />
      <aside className="band perforated z-10 flex flex-col gap-4 p-3 md:sticky md:top-0 md:h-screen md:p-4">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <Wordmark />
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col" aria-label="Dashboard">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${active ? "bg-on-pine text-[#0f3d2e]" : "text-on-pine-muted hover:bg-white/10 hover:text-on-pine"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.id}
                {item.id === "Approvals" && holds.length > 0 ? (
                  <span className="money ml-auto rounded bg-brass px-1.5 text-xs font-semibold text-[#14261f]">{holds.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden md:block">
          <p className="eyebrow mb-2 px-1">Theme</p>
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{owner.email}</p>
              <h1 className="mt-1 text-4xl">{owner.name}&apos;s household</h1>
            </div>
            <p className="max-w-sm text-sm text-muted sm:text-right">
              {vault?.status === "vaulted" ? "Linked" : "Not linked"} to PayPal · <span className="money text-xs">{vault?.paymentTokenId ?? "no payment token"}</span> · AgentPurse does not hold a balance.
            </p>
          </header>

          {owner.panicFrozen ? (
            <p className="mt-4 rounded-lg border-2 border-deny px-4 py-3 text-sm font-medium text-deny">Panic freeze is on. Every payment is stopped until {owner.name} clears it.</p>
          ) : null}

          <dl className="panel mt-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Stat label="Left to spend"><AnimatedNumber cents={totalLeft} /></Stat>
            <Stat label="Spent so far">{formatMoney(totalSpent)}</Stat>
            <Stat label="Waiting on you">{holds.length}</Stat>
            <Stat label="Blocked by the guard">{blocked.length}</Stat>
          </dl>

          {latestDetail && holds.length === 0 ? (
            <p className="mt-4 text-sm text-muted"><span className="eyebrow mr-2">Latest</span>{latestDetail}</p>
          ) : null}

          <section className="mt-6" aria-label="Held payments">
            {holds.length === 0 ? <p className="text-sm text-muted">Nothing is held.</p> : (
              <div className="space-y-3">
                <h2 className="text-2xl">Waiting for your signature</h2>
                {holds.map((hold) => (
                  <HoldActions
                    key={hold.id}
                    spendId={hold.id}
                    title={hold.merchantName ?? "Request"}
                    explanation={hold.explanation ?? hold.rawText}
                    amount={formatMoney(hold.amountCents ?? 0, hold.currency ?? undefined)}
                    agentId={hold.agentId}
                    agentName={agentName(hold.agentId)}
                    onApproved={() => setPaid(true)}
                  />
                ))}
              </div>
            )}
          </section>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              className="mt-6"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {section === "Overview" ? (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {agents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} todayCents={spentToday(receipts, agent.id)} />
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <section className="panel !p-0">
                      <h2 className="px-5 pt-5 text-xl">The ledger</h2>
                      <ul className="ledger mt-3">
                        {intents.slice(0, 6).map((intent) => (
                          <li key={intent.id} className="flex items-start gap-3 px-5 py-3">
                            <AgentFace id={intent.agentId} status="active" size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{intent.merchantName ?? "Request"}</p>
                              <p className="line-clamp-2 text-sm text-muted">{intent.explanation ?? intent.rawText}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {intent.amountCents != null ? <span className="money text-sm">{formatMoney(intent.amountCents, intent.currency ?? undefined)}</span> : null}
                              <StatusStamp status={intent.status} />
                            </div>
                          </li>
                        ))}
                        {intents.length === 0 ? <li className="px-5 py-4 text-sm text-muted">No requests yet. Ask from the Agents tab.</li> : null}
                      </ul>
                    </section>
                    <div className="space-y-4">
                      <SpendOverTime data={overTime} />
                      <CategoryBars rows={byCategory} />
                    </div>
                  </div>
                  {notifications.length > 0 ? (
                    <section className="panel">
                      <h2 className="text-xl">Notices</h2>
                      <ul className="mt-2 space-y-1 text-sm">
                        {notifications.map((note) => (
                          <li key={note.id}><span className="font-medium">{note.title}</span> <span className="text-muted">· {note.body}</span></li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {section === "Agents" ? (
                <div className="space-y-4">
                  {agents.map((agent) => (
                    <section key={agent.id} className="panel grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                      <div>
                        <div className="flex items-center gap-3">
                          <AgentFace id={agent.id} status={agent.status} />
                          <div className="min-w-0">
                            <h2 className="text-2xl">{agent.name}</h2>
                            <p className="text-sm text-muted">{agent.description}</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <SpendForm agentId={agent.id} agentName={agent.name} samples={SAMPLES[agent.id] ?? ["Pay a merchant $10"]} />
                        </div>
                      </div>
                      <div className="border-line lg:border-l lg:pl-5">
                        <p className="eyebrow">Demo key</p>
                        <p className="money mt-1 text-xs break-all">{DEMO_KEYS[agent.id as keyof typeof DEMO_KEYS] ?? agent.apiKeyPrefix}</p>
                        <div className="mt-4">
                          <AllowanceForm agentId={agent.id} agentName={agent.name} />
                        </div>
                        <div className="mt-3">
                          <AgentPause agentId={agent.id} paused={agent.status === "paused"} />
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {section === "Approvals" ? (
                <section className="panel">
                  <h2 className="text-xl">Paid, and still refundable</h2>
                  <p className="mt-1 text-sm text-muted">Held cheques stay pinned above on every tab, so a decision is never more than one tap away.</p>
                  {captured.length > 0 ? (
                    <div className="ledger mt-4">
                      {captured.map((intent) => (
                        <div key={intent.id} className="py-2">
                          <RefundButton spendId={intent.id} label={`${intent.merchantName ?? "Payment"} · ${formatMoney(intent.amountCents ?? 0)}`} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-4 text-sm text-muted">No payments to refund.</p>}
                </section>
              ) : null}

              {section === "Receipts" ? (
                <section className="panel">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl">Receipts</h2>
                    <div className="flex flex-wrap gap-2">
                      <div className="flex gap-1" role="group" aria-label="Filter receipts">
                        {(["all", "capture", "refund"] as const).map((kind) => (
                          <button key={kind} type="button" aria-pressed={receiptKind === kind} className={`min-h-11 cursor-pointer rounded-lg px-3 py-1 text-sm capitalize ${receiptKind === kind ? "bg-sunk font-semibold" : "text-muted"}`} onClick={() => setReceiptKind(kind)}>
                            {kind}
                          </button>
                        ))}
                      </div>
                      <label className="sr-only" htmlFor="receipt-agent">Agent</label>
                      <select id="receipt-agent" className="min-h-11 !w-auto max-w-48" value={receiptAgent} onChange={(event) => setReceiptAgent(event.target.value)}>
                        <option value="all">All agents</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {filteredReceipts.length === 0 ? <p className="mt-4 text-sm text-muted">No receipts match this filter.</p> : null}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="eyebrow text-left">
                          <th className="py-2 pr-4 font-medium">When</th>
                          <th className="pr-4 font-medium">Merchant</th>
                          <th className="pr-4 font-medium">Kind</th>
                          <th className="text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReceipts.map((receipt) => (
                          <tr key={receipt.id} className="border-t border-line align-top">
                            <td className="money py-2.5 pr-4 text-xs whitespace-nowrap text-muted">{receipt.createdAt.slice(0, 16).replace("T", " ")}</td>
                            <td className="py-2.5 pr-4">
                              <div className="font-medium">{receipt.merchantName}</div>
                              <div className="text-muted">{receipt.detail}</div>
                            </td>
                            <td className="py-2.5 pr-4 capitalize">{receipt.kind}</td>
                            <td className="money py-2.5 text-right whitespace-nowrap">{receipt.kind === "refund" ? "+" : "−"}{formatMoney(receipt.amountCents, receipt.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {section === "Guard" ? (
                <section className="panel">
                  <h2 className="text-xl">Injection guard log</h2>
                  <p className="mt-1 text-sm text-muted">Every purchase is compared with the task it came from. These did not match.</p>
                  {blocked.length === 0 ? <p className="mt-4 text-sm text-muted">No page has tried to redirect an agent yet.</p> : null}
                  <ul className="ledger mt-3">
                    {blocked.map((intent) => (
                      <li key={intent.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                        <div>
                          <p className="font-medium">{intent.merchantName ?? "Blocked request"}</p>
                          <p className="text-muted">{intent.explanation}</p>
                        </div>
                        <span className="stamp deny">Blocked</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm">
                    <Link className="font-medium underline" href="/demo/injection">Try the injection demo</Link>
                  </p>
                </section>
              ) : null}

              {section === "Controls" ? (
                <section className="panel">
                  <h2 className="text-xl">Kill switch</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted">Panic stops every payment. Revoke deletes the PayPal vault token. To pause one agent, use the Agents tab.</p>
                  <div className="mt-5">
                    <HouseholdControls ownerId={owner.id} panic={owner.panicFrozen} vaultStatus={vault?.status ?? "missing"} />
                  </div>
                </section>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function spentToday(receipts: Receipt[], agentId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return receipts
    .filter((receipt) => receipt.agentId === agentId && new Date(receipt.createdAt) >= start)
    .reduce((sum, receipt) => sum + (receipt.kind === "refund" ? -receipt.amountCents : receipt.amountCents), 0);
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{children}</dd>
    </div>
  );
}

function StatusStamp({ status }: { status: string }) {
  const stamp = STAMPS[status] ?? { tone: "quiet", label: status.replaceAll("_", " ") };
  return <span className={`stamp ${stamp.tone}`}>{stamp.label}</span>;
}

function AgentCard({ agent, todayCents }: { agent: Agent; todayCents: number }) {
  const ratio = agent.allowanceCents <= 0 ? 0 : Math.min(1, Math.max(0, agent.spentCents / agent.allowanceCents));
  return (
    <article className="panel flex flex-col">
      <div className="flex items-center gap-3">
        <AgentFace id={agent.id} status={agent.status} />
        <div className="min-w-0">
          <h2 className="text-xl leading-tight">{agent.name}</h2>
          <p className="text-xs text-muted capitalize">{agent.status} · {agent.provider}</p>
        </div>
      </div>
      <p className="mt-4 font-serif text-3xl tabular-nums">
        <AnimatedNumber cents={agent.remainingCents} /> <span className="font-sans text-sm text-muted">left</span>
      </p>
      <div className="meter mt-2" role="img" aria-label={`${Math.round(ratio * 100)}% of the allowance spent`}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {formatMoney(agent.spentCents)} of {formatMoney(agent.allowanceCents)} · {formatMoney(todayCents)} today
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {agent.allowedCategories.map((category) => (
          <span key={category} className="chip">{category}</span>
        ))}
        <span className="chip">asks at {formatMoney(agent.approvalThresholdCents)}</span>
      </div>
    </article>
  );
}

function CategoryBars({ rows }: { rows: Array<{ name: string; cents: number }> }) {
  const top = Math.max(1, ...rows.map((row) => row.cents));
  return (
    <section className="panel">
      <h2 className="text-xl">Paid by category</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing paid yet.</p> : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.name} title={`${row.name}: ${formatMoney(row.cents)}`}>
              <div className="flex justify-between text-sm">
                <span className="capitalize">{row.name}</span>
                <span className="money text-muted">{formatMoney(row.cents)}</span>
              </div>
              <div className="meter mt-1"><span style={{ width: `${(row.cents / top) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SpendOverTime({ data }: { data: Array<{ day: string; dollars: number }> }) {
  return (
    <section className="panel" aria-label="Spend over time">
      <h2 className="text-xl">Spend by day</h2>
      {data.length < 2 ? (
        <p className="mt-2 text-sm text-muted">{data.length === 1 ? `One day on the books, ${data[0].day}: $${data[0].dollars.toFixed(2)}.` : "Nothing paid yet."} The line starts on day two.</p>
      ) : (
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", fontSize: 12 }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Spent"]}
              />
              <Area type="monotone" dataKey="dollars" stroke="var(--ink)" fill="var(--sunk)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
