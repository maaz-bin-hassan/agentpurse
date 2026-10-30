"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Inbox, LayoutDashboard, Power, Receipt, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentFace, AllowanceRing } from "@/components/agents/faces";
import { AgentPause } from "@/components/AgentPause";
import { AllowanceForm } from "@/components/AllowanceForm";
import { HoldActions } from "@/components/HoldActions";
import { HouseholdControls } from "@/components/HouseholdControls";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ConfettiBurst } from "@/components/motion/confetti";
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

export function Dashboard({ data }: { data: DashboardData }) {
  const reduce = useReducedMotion();
  const [section, setSection] = useState<Nav>("Overview");
  const [receiptKind, setReceiptKind] = useState<"all" | "capture" | "refund">("all");
  const [receiptAgent, setReceiptAgent] = useState("all");
  const [pulse, setPulse] = useState(false);
  const { owner, vault, agents, holds, captured, intents, receipts, notifications, latestDetail } = data;

  const byAgent = useMemo(
    () =>
      agents.map((agent) => ({
        name: agent.name,
        spent: Math.max(0, agent.spentCents) / 100,
      })),
    [agents],
  );
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const intent of intents) {
      if (intent.status !== "captured" && intent.status !== "refunded") continue;
      const key = intent.category ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + (intent.amountCents ?? 0));
    }
    return [...totals.entries()].map(([name, cents]) => ({ name, dollars: cents / 100 }));
  }, [intents]);
  const overTime = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const receipt of receipts) {
      const day = receipt.createdAt.slice(0, 10);
      const delta = receipt.kind === "refund" ? -receipt.amountCents : receipt.amountCents;
      byDay.set(day, (byDay.get(day) ?? 0) + delta);
    }
    const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return rows.length ? rows.map(([day, cents]) => ({ day: day.slice(5), dollars: cents / 100 })) : [{ day: "today", dollars: 0 }];
  }, [receipts]);

  const filteredReceipts = receipts.filter((receipt) => {
    if (receiptKind !== "all" && receipt.kind !== receiptKind) return false;
    if (receiptAgent !== "all" && receipt.agentId !== receiptAgent) return false;
    return true;
  });
  const blocked = intents.filter((intent) => intent.status === "blocked" || intent.guardDecision === "block");

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-3 py-4 md:grid-cols-[232px_1fr] md:px-6 md:py-6">
      <ConfettiBurst show={pulse} />
      <aside className="glass sticky top-4 flex h-fit flex-col gap-2 rounded-3xl p-3">
        <div className="px-2 py-2">
          <p className="text-xs tracking-[0.18em] text-violet uppercase">AgentPurse</p>
          <p className="mt-1 text-sm text-[#9aa3b8]">{owner.name}</p>
        </div>
        <nav className="flex gap-1 overflow-auto md:flex-col" aria-label="Dashboard">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${section === item.id ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.12)]" : "text-[#c9d0df] hover:bg-white/5"}`}
                aria-current={section === item.id ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.id}
              </button>
            );
          })}
        </nav>
        <div className="mt-2 px-1">
          <ThemeToggle />
        </div>
      </aside>
      <main className="relative min-w-0">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-violet uppercase">{owner.email}</p>
            <h1 className="mt-1 text-3xl tracking-tight">{owner.name}&apos;s household</h1>
          </div>
          <div className="max-w-sm text-sm text-[#9aa3b8]">
            <p>
              {vault?.status === "vaulted" ? "Linked" : "Not linked"} · {vault?.paymentTokenId ?? "No payment token"} · AgentPurse does not hold a balance.
              {owner.panicFrozen ? " Panic freeze is on." : ""}
            </p>
            {latestDetail ? <p className="mt-2 text-[#d5dbeb]">{latestDetail}</p> : null}
          </div>
        </header>
        {holds.length === 0 ? <p className="mb-3 text-sm text-[#9aa3b8]">Nothing is held.</p> : (
          <div className="mb-4 space-y-3">
            {holds.map((hold) => (
              <HoldActions key={hold.id} spendId={hold.id} title={hold.merchantName ?? "Request"} explanation={hold.explanation ?? hold.rawText} onApproved={() => setPulse(true)} />
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
            {section === "Overview" ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} todayCents={spentToday(receipts, agent.id)} />
                  ))}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <ChartCard title="Spend by agent" data={byAgent} dataKey="spent" x="name" />
                  <ChartCard title="Captured by category" data={byCategory.length ? byCategory : [{ name: "none", dollars: 0 }]} dataKey="dollars" x="name" />
                </div>
                <TimeChart data={overTime} />
                <section className="glass rounded-3xl p-5">
                  <h2 className="text-lg">Live activity</h2>
                  <ul className="mt-3 space-y-2">
                    {intents.slice(0, 6).map((intent, index) => (
                      <motion.li
                        key={intent.id}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        initial={reduce ? false : { opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : index * 0.06, duration: 0.35 }}
                      >
                        <span className="font-medium">{intent.merchantName ?? "Request"}</span>
                        <span className="text-[#9aa3b8]"> · {intent.status}</span>
                        <p className="text-[#9aa3b8]">{intent.explanation ?? intent.rawText}</p>
                      </motion.li>
                    ))}
                  </ul>
                  {notifications.length > 0 ? (
                    <ul className="mt-4 space-y-2 text-sm text-[#c9d0df]">
                      {notifications.map((note) => (
                        <li key={note.id}><span className="font-medium">{note.title}</span> · {note.body}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            ) : null}
            {section === "Agents" ? (
              <div className="space-y-4">
                {agents.map((agent) => (
                  <section key={agent.id} className="glass rounded-3xl p-4">
                    <SpendForm
                      agentId={agent.id}
                      agentName={agent.name}
                      description={`${agent.description} Demo key ${DEMO_KEYS[agent.id as keyof typeof DEMO_KEYS] ?? agent.apiKeyPrefix}.`}
                      samples={SAMPLES[agent.id] ?? ["Pay a merchant $10"]}
                    />
                    <AllowanceForm agentId={agent.id} agentName={agent.name} />
                    <div className="mt-3">
                      <AgentPause agentId={agent.id} paused={agent.status === "paused"} />
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
            {section === "Approvals" ? (
              <section className="glass rounded-3xl p-4">
                <h2 className="text-lg">Waiting on {owner.name}</h2>
                <p className="mt-2 text-sm text-[#9aa3b8]">Open holds sit at the top of the dashboard so a decision is one motion away.</p>
                {captured.length > 0 ? (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-base">Captured, still refundable</h3>
                    {captured.map((intent) => (
                      <RefundButton key={intent.id} spendId={intent.id} label={`${intent.merchantName ?? "Payment"} · ${formatMoney(intent.amountCents ?? 0)}`} />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
            {section === "Receipts" ? (
              <section className="glass rounded-3xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg">Receipts</h2>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex gap-2" role="group" aria-label="Filter receipts">
                      {(["all", "capture", "refund"] as const).map((kind) => (
                        <button key={kind} type="button" className={`min-h-11 rounded-full px-3 py-1 text-xs uppercase ${receiptKind === kind ? "bg-white text-black" : "border border-white/10"}`} onClick={() => setReceiptKind(kind)}>
                          {kind}
                        </button>
                      ))}
                    </div>
                    <label className="sr-only" htmlFor="receipt-agent">Agent</label>
                    <select id="receipt-agent" className="min-h-11 w-auto max-w-48 rounded-full" value={receiptAgent} onChange={(event) => setReceiptAgent(event.target.value)}>
                      <option value="all">All agents</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {filteredReceipts.length === 0 ? <p className="mt-4 text-[#9aa3b8]">No receipts in this filter.</p> : null}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs tracking-wide text-[#9aa3b8] uppercase">
                        <th className="py-2">When</th>
                        <th>Merchant</th>
                        <th>Kind</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReceipts.map((receipt) => (
                        <tr key={receipt.id} className="border-t border-white/10">
                          <td className="py-2 text-[#9aa3b8]">{receipt.createdAt.slice(0, 16).replace("T", " ")}</td>
                          <td>
                            <div className="font-medium">{receipt.merchantName}</div>
                            <div className="text-[#9aa3b8]">{receipt.detail}</div>
                          </td>
                          <td>{receipt.kind}</td>
                          <td className="text-right">{receipt.kind === "refund" ? "+" : "−"}{formatMoney(receipt.amountCents, receipt.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {section === "Guard" ? (
              <section className="glass rounded-3xl p-4">
                <h2 className="text-lg">Injection guard log</h2>
                {blocked.length === 0 ? <p className="mt-3 text-[#9aa3b8]">No blocked page instructions yet.</p> : null}
                <ul className="mt-3 space-y-2">
                  {blocked.map((intent) => (
                    <li key={intent.id} className="rounded-2xl border border-rose/40 bg-rose/10 p-3 text-sm">
                      <p className="font-medium">{intent.merchantName ?? "Blocked request"}</p>
                      <p>{intent.explanation}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm">
                  <a className="text-cyan" href="/demo/injection">Try the injection demo</a>
                </p>
              </section>
            ) : null}
            {section === "Controls" ? (
              <section className="glass rounded-3xl p-6">
                <h2 className="text-lg">Kill switch</h2>
                <p className="mt-1 max-w-xl text-sm text-[#9aa3b8]">Pause is on each agent card. Panic stops every payment. Revoke deletes the PayPal vault token.</p>
                <div className={`mt-6 ${pulse ? "animate-pulse" : ""}`}>
                  <HouseholdControls ownerId={owner.id} panic={owner.panicFrozen} vaultStatus={vault?.status ?? "missing"} />
                </div>
              </section>
            ) : null}
          </motion.div>
        </AnimatePresence>
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

function AgentCard({ agent, todayCents }: { agent: Agent; todayCents: number }) {
  const reduce = useReducedMotion();
  return (
      <motion.article className="glass lift rounded-3xl p-4" whileHover={reduce ? undefined : { y: -4 }} whileTap={reduce ? undefined : { scale: 0.985 }}>
      <div className="flex items-center gap-3">
        <AllowanceRing spent={agent.spentCents} allowance={agent.allowanceCents} ringId={agent.id}>
          <AgentFace id={agent.id} status={agent.status} />
        </AllowanceRing>
        <div>
          <h2 className="text-lg">{agent.name}</h2>
          <p className="text-xs tracking-wide text-[#9aa3b8] uppercase">{agent.provider} · {agent.status}</p>
        </div>
      </div>
      <p className="mt-3 text-2xl">
        <AnimatedNumber cents={agent.remainingCents} /> <span className="text-sm text-[#9aa3b8]">left</span>
      </p>
      <p className="text-xs text-[#9aa3b8]">
        {formatMoney(agent.spentCents)} spent of {formatMoney(agent.allowanceCents)} · today {formatMoney(todayCents)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {agent.allowedCategories.map((category) => (
          <span key={category} className="chip">{category}</span>
        ))}
        <span className="chip">ask at {formatMoney(agent.approvalThresholdCents)}</span>
      </div>
    </motion.article>
  );
}

function ChartCard({ title, data, dataKey, x }: { title: string; data: Array<Record<string, string | number>>; dataKey: string; x: string }) {
  return (
    <section className="glass h-72 rounded-3xl p-4">
      <h2 className="text-lg">{title}</h2>
      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey={x} stroke="#9aa3b8" fontSize={12} />
            <YAxis stroke="#9aa3b8" fontSize={12} />
            <Tooltip contentStyle={{ background: "#12141c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
            <Bar dataKey={dataKey} fill="#8b7cff" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TimeChart({ data }: { data: Array<{ day: string; dollars: number }> }) {
  return (
    <section className="glass h-72 rounded-3xl p-4" aria-label="Spend over time">
      <h2 className="text-lg">Spend over time</h2>
      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3ee0c5" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#3ee0c5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="day" stroke="#9aa3b8" fontSize={12} />
            <YAxis stroke="#9aa3b8" fontSize={12} />
            <Tooltip contentStyle={{ background: "#12141c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
            <Area type="monotone" dataKey="dollars" stroke="#3ee0c5" fill="url(#spend-fill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
