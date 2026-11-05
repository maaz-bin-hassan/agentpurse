"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, Compass, Inbox, LayoutDashboard, ListChecks, Power, Receipt, Shield, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConnectCard } from "@/components/account/connect-card";
import { NewAgent } from "@/components/account/new-agent";
import { SetupChecklist } from "@/components/account/setup-checklist";
import { AgentFace } from "@/components/agents/faces";
import { AgentPause } from "@/components/AgentPause";
import { AllowanceForm } from "@/components/AllowanceForm";
import { Wordmark } from "@/components/brand/logo";
import { HoldActions } from "@/components/HoldActions";
import { HouseholdControls } from "@/components/HouseholdControls";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { StampBurst } from "@/components/motion/stamp-burst";
import { RefundButton } from "@/components/RefundButton";
import { ShopPanel, type WatchRow } from "@/components/shop/shop-panel";
import { SpendForm } from "@/components/SpendForm";
import { GuidedTour, type TourStep } from "@/components/tour/guided-tour";
import { DEMO_KEYS } from "@/src/domain/demo-keys";
import { formatMoney } from "@/src/domain/money";
import type { AgentTemplate } from "@/src/domain/templates";

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
  productTitle: string | null;
  offerUrl: string | null;
  imageUrl: string | null;
  priceNote: string | null;
  createdAt: string;
};

type Receipt = {
  id: string;
  intentId: string;
  agentId: string;
  merchantName: string;
  kind: "capture" | "refund";
  amountCents: number;
  currency: string;
  detail: string;
  paypalOrderId: string | null;
  captureId: string | null;
  createdAt: string;
};

export type DashboardData = {
  owner: { id: string; name: string; email: string; panicFrozen: boolean };
  vault: { status: string; paymentTokenId: string | null; payerEmail: string | null } | null;
  paypalMode: "mock" | "live";
  mockCatalog: boolean;
  watches: WatchRow[];
  linkNotice: string | null;
  agents: Agent[];
  holds: Intent[];
  captured: Intent[];
  intents: Intent[];
  receipts: Receipt[];
  notifications: Array<{ id: string; title: string; body: string }>;
  latestDetail: string | null;
  /** Present for a signed-in account. Absent on the judges' demo purse. */
  account?: { email: string; mcpUrl: string; templates: AgentTemplate[] } | null;
};

const NAV = [
  { id: "Setup", icon: ListChecks },
  { id: "Overview", icon: LayoutDashboard },
  { id: "Shop", icon: ShoppingBag },
  { id: "Agents", icon: Bot },
  { id: "Approvals", icon: Inbox },
  { id: "Receipts", icon: Receipt },
  { id: "Guard", icon: Shield },
  { id: "Controls", icon: Power },
] as const;
type Nav = (typeof NAV)[number]["id"];

const CATEGORY_SAMPLES: Record<string, string> = {
  groceries: "Buy oat milk and eggs from Green Grocer for $18.40",
  travel: "Buy Metro Rail tickets for $42",
  software: "Pay CloudApps $9 for extra storage",
  electronics: "Buy a $30 USB-C charger from voltbay.example",
  shopping: "Buy $25 of paper towels and dish soap",
};

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
  failed: { tone: "deny", label: "Failed" },
};

export function Dashboard({ data }: { data: DashboardData }) {
  const reduce = useReducedMotion();
  const account = data.account ?? null;
  const needsSetup = Boolean(account) && (data.agents.length === 0 || data.vault?.status !== "vaulted");
  const [section, setSection] = useState<Nav>(needsSetup ? "Setup" : "Overview");
  const nav = NAV.filter((item) => item.id !== "Setup" || account);
  const [tourOpen, setTourOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const tourKey = account ? `ap_tour_done_${data.owner.id}` : "ap_demo_welcome_done";
  // First visit: an account opens the tour; the demo shows a welcome card that offers it.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(tourKey) === "1";
    } catch {
      seen = true;
    }
    if (seen) return;
    if (account) setTourOpen(true);
    else setWelcome(true);
  }, [tourKey, account]);
  const markSeen = () => {
    try {
      localStorage.setItem(tourKey, "1");
    } catch {
      /* private mode: the tour simply shows again next time */
    }
  };
  const closeTour = () => {
    setTourOpen(false);
    markSeen();
  };
  const startTour = () => {
    setWelcome(false);
    markSeen();
    setTourOpen(true);
  };
  const tourSteps = account ? accountTour(setSection, closeTour) : demoTour(setSection, closeTour);
  const [receiptKind, setReceiptKind] = useState<"all" | "capture" | "refund">("all");
  const [receiptAgent, setReceiptAgent] = useState("all");
  const [paid, setPaid] = useState(false);
  const { owner, vault, paypalMode, mockCatalog, watches, linkNotice, agents, holds, captured, intents, receipts, notifications, latestDetail } = data;

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
      <GuidedTour steps={tourSteps} open={tourOpen} onClose={closeTour} />
      <aside className="band perforated z-10 flex flex-col gap-4 p-3 md:sticky md:top-0 md:h-screen md:p-4">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <Wordmark />
          <button type="button" className="btn secondary !min-h-9 !px-3 text-xs md:hidden" onClick={startTour}>
            <Compass className="h-4 w-4" aria-hidden /> Tour
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col" aria-label="Dashboard">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                data-tour={`nav-${item.id}`}
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
          <p className="eyebrow mb-2 px-1">New here?</p>
          <button type="button" className="btn secondary w-full" onClick={startTour} data-tour="tour-button">
            <Compass className="h-4 w-4" aria-hidden /> Take the tour
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{account ? account.email : "Your household"}</p>
              <h1 className="mt-1 text-4xl">{owner.name}&apos;s {account ? "purse" : "household"}</h1>
              {account ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <Link href="/tutorial">Tutorial</Link>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="cursor-pointer underline underline-offset-[3px]">Sign out</button>
                  </form>
                </div>
              ) : null}
            </div>
            <div className="max-w-sm text-sm text-muted sm:text-right">
              <p className={`stamp ${paypalMode === "live" ? "allow" : "quiet"}`}>{paypalMode === "live" ? "PayPal sandbox" : "Test mode"}</p>
              <p className="mt-2" data-tour="paypal">
                {vault?.status === "vaulted" ? "Linked" : "Not linked"} to PayPal{vault?.status === "vaulted" && vault.payerEmail ? ` as ${vault.payerEmail}` : ""} · <span className="money text-xs">{vault?.paymentTokenId ?? "no payment token"}</span> · AgentPurse does not hold a balance.
              </p>
            </div>
          </header>

          {linkNotice ? <p className="mt-4 rounded-lg border border-line bg-card px-4 py-3 text-sm" role="status">{linkNotice}</p> : null}

          {owner.panicFrozen ? (
            <p className="mt-4 rounded-lg border-2 border-deny px-4 py-3 text-sm font-medium text-deny">Panic freeze is on. Every payment is stopped until {owner.name} clears it.</p>
          ) : null}

          {welcome ? (
            <section className="cheque mt-6 p-5 sm:p-6" aria-label="Welcome">
              <p className="eyebrow">Welcome · live demo, no account needed</p>
              <h2 className="mt-2 text-3xl leading-tight">This is a checkbook for AI agents.</h2>
              <p className="mt-2 max-w-2xl text-muted">
                Maaz&apos;s four agents ask to spend in plain English. A clerk written in plain code pays it, holds it for Maaz to sign, or refuses. PayPal moves the money; AgentPurse never holds it.
              </p>
              <div className="actions">
                <button type="button" className="btn" onClick={startTour}>
                  Show me around <ArrowRight className="nudge h-4 w-4" aria-hidden />
                </button>
                <Link className="btn secondary" href="/signup">Create my own purse</Link>
                <button type="button" className="cursor-pointer px-2 text-sm text-muted underline underline-offset-[3px]" onClick={() => { setWelcome(false); markSeen(); }}>
                  I&apos;ll explore
                </button>
              </div>
            </section>
          ) : null}

          <dl data-tour="stats" className="panel mt-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Stat label="Left to spend"><AnimatedNumber cents={totalLeft} /></Stat>
            <Stat label="Spent so far">{formatMoney(totalSpent)}</Stat>
            <Stat label="Waiting on you">{holds.length}</Stat>
            <Stat label="Blocked by the guard">{blocked.length}</Stat>
          </dl>

          {latestDetail && holds.length === 0 ? (
            <p className="mt-4 text-sm text-muted"><span className="eyebrow mr-2">Latest</span>{latestDetail}</p>
          ) : null}

          <section className="mt-6" aria-label="Held payments" data-tour="holds">
            {holds.length === 0 ? <p className="text-sm text-muted">Nothing is held.</p> : (
              <div className="space-y-3">
                <h2 className="text-2xl">Waiting for your signature</h2>
                {holds.map((hold) => (
                  <HoldActions
                    key={hold.id}
                    spendId={hold.id}
                    title={hold.productTitle ?? hold.merchantName ?? "Request"}
                    explanation={[hold.explanation ?? hold.rawText, hold.priceNote].filter(Boolean).join(" ")}
                    imageUrl={hold.imageUrl}
                    buyUrl={hold.offerUrl}
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
              {section === "Setup" && account ? (
                <SetupChecklist
                  ownerId={owner.id}
                  paypalMode={paypalMode}
                  linked={vault?.status === "vaulted"}
                  agentCount={agents.length}
                  requestCount={intents.length}
                  onGoAgents={() => setSection("Agents")}
                />
              ) : null}

              {section === "Overview" ? (
                <div className="space-y-6">
                  {account && agents.length === 0 ? (
                    <section className="panel flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl">Your purse is empty, and that is safe.</h2>
                        <p className="mt-1 text-sm text-muted">No agent can spend until you create one and give it an allowance.</p>
                      </div>
                      <button type="button" className="btn" onClick={() => setSection(vault?.status === "vaulted" ? "Agents" : "Setup")}>
                        {vault?.status === "vaulted" ? "Create your first agent" : "Start setup"} <ArrowRight className="nudge h-4 w-4" aria-hidden />
                      </button>
                    </section>
                  ) : null}
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
                              <p className="font-medium">{intent.productTitle ?? intent.merchantName ?? "Request"}</p>
                              <p className="line-clamp-2 text-sm text-muted">{intent.explanation ?? intent.rawText}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {intent.amountCents != null ? <span className="money text-sm">{formatMoney(intent.amountCents, intent.currency ?? undefined)}</span> : null}
                              <StatusStamp status={intent.status} />
                            </div>
                          </li>
                        ))}
                        {intents.length === 0 ? <li className="px-5 py-4 text-sm text-muted">{agents.length === 0 ? "No agents yet. Create one from the Agents tab." : "No requests yet. Ask from the Agents tab."}</li> : null}
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

              {section === "Shop" ? <ShopPanel ownerId={owner.id} watches={watches} mockCatalog={mockCatalog} onPaid={() => setPaid(true)} /> : null}

              {section === "Agents" ? (
                <div className="space-y-4">
                  {account ? <NewAgent templates={account.templates} mcpUrl={account.mcpUrl} /> : null}
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
                          <SpendForm agentId={agent.id} agentName={agent.name} samples={SAMPLES[agent.id] ?? agent.allowedCategories.map((category) => CATEGORY_SAMPLES[category]).filter(Boolean)} />
                        </div>
                      </div>
                      <div className="border-line lg:border-l lg:pl-5">
                        {account ? (
                          <details>
                            <summary className="cursor-pointer text-sm font-medium">Connect to your AI <span className="money text-xs text-muted">· key {agent.apiKeyPrefix}…</span></summary>
                            <div className="mt-3">
                              <ConnectCard agentId={agent.id} agentName={agent.name} mcpUrl={account.mcpUrl} canRotate />
                            </div>
                          </details>
                        ) : (
                          <>
                            <p className="eyebrow">Demo key</p>
                            <p className="money mt-1 text-xs break-all">{DEMO_KEYS[agent.id as keyof typeof DEMO_KEYS] ?? agent.apiKeyPrefix}</p>
                          </>
                        )}
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
                        {filteredReceipts.map((receipt) => {
                          const catalog = intents.find((intent) => intent.id === receipt.intentId && intent.offerUrl);
                          return (
                          <tr key={receipt.id} className="border-t border-line align-top">
                            <td className="money py-2.5 pr-4 text-xs whitespace-nowrap text-muted">{receipt.createdAt.slice(0, 16).replace("T", " ")}</td>
                            <td className="py-2.5 pr-4">
                              <div className="font-medium">{receipt.merchantName}</div>
                              <div className="text-muted">{receipt.detail}</div>
                              {receipt.paypalOrderId ? (
                                <div className="money mt-0.5 text-xs break-all text-muted">
                                  PayPal order {receipt.paypalOrderId}{receipt.captureId ? ` · capture ${receipt.captureId}` : ""}
                                </div>
                              ) : null}
                              {catalog?.offerUrl ? (
                                <div className="mt-0.5 text-xs text-muted">
                                  {catalog.productTitle}. Sandbox settlement. No retailer order placed. <a className="underline" href={catalog.offerUrl} target="_blank" rel="noreferrer">Buy link</a>. We may earn a commission when you buy through links on this page.
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-4 capitalize">{receipt.kind}</td>
                            <td className="money py-2.5 text-right whitespace-nowrap">{receipt.kind === "refund" ? "+" : "−"}{formatMoney(receipt.amountCents, receipt.currency)}</td>
                          </tr>
                          );
                        })}
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
                    <HouseholdControls ownerId={owner.id} panic={owner.panicFrozen} vaultStatus={vault?.status ?? "missing"} demo={!account} />
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

function accountTour(go: (nav: Nav) => void, close: () => void): TourStep[] {
  return [
    {
      title: "Welcome to your purse",
      body: (
        <>
          <p>AgentPurse is a checkbook for your AI agents.</p>
          <p className="mt-2">Your agent asks to pay in plain English. A clerk written in plain code <strong className="text-allow">pays</strong> it, <strong className="text-hold">holds</strong> it for your signature, or <strong className="text-deny">refuses</strong>. PayPal moves the money. AgentPurse never holds it.</p>
          <p className="mt-2">Five quick stops, then you set it up.</p>
        </>
      ),
    },
    { target: "nav-Setup", onEnter: () => go("Setup"), title: "1. Start here", body: "Setup is your checklist: link PayPal, create an agent, connect your AI, make a first request. About five minutes. Each step ticks itself off." },
    { target: "paypal", title: "2. Link PayPal once", body: "You sign in at PayPal and approve. PayPal keeps your wallet; we keep only a token. This line shows whether you are linked. Revoke on Controls deletes the token." },
    { target: "nav-Agents", title: "3. Create an agent", body: "Pick one of eight templates, like Grocery runner or Travel booker. Change the allowance and limits, save, and copy the ready-made prompt into Claude, Cursor, or Grok." },
    { target: "holds", title: "4. Sign the big ones", body: "Anything over an agent's hold amount, or at a store you have not trusted, waits here as a cheque. Approve and pay, or Deny." },
    { target: "nav-Controls", title: "5. The off switch", body: "Panic freeze stops every payment at once. To stop one agent, pause it on the Agents tab." },
    {
      title: "Ready? Link PayPal first.",
      body: "You can replay this tour from the sidebar any time.",
      actions: (
        <button type="button" className="btn !min-h-10" onClick={() => { close(); go("Setup"); }}>
          Start setup <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      ),
    },
  ];
}

function demoTour(go: (nav: Nav) => void, close: () => void): TourStep[] {
  return [
    {
      title: "A checkbook for AI agents",
      body: (
        <>
          <p>This is Maaz&apos;s demo purse. Four agents have allowances: Grocer, Wayfinder, Stack, and Handy.</p>
          <p className="mt-2">An agent asks to pay in plain English. A clerk in plain code <strong className="text-allow">pays</strong>, <strong className="text-hold">holds</strong> for Maaz, or <strong className="text-deny">refuses</strong>. No model can talk it out of a no.</p>
        </>
      ),
      onEnter: () => go("Overview"),
    },
    { target: "stats", title: "The purse at a glance", body: "What is left across all allowances, what was paid, what waits for a signature, and what the guard blocked." },
    { target: "nav-Agents", title: "Try a held payment", body: "Open Agents. Under Wayfinder, pick \"Hold a $75 seat from Metro Rail\" and press Ask the clerk. It is over the $50 line, so it waits for Maaz." },
    { target: "holds", title: "Then sign it", body: "The held cheque appears here on every tab. Press Approve and pay. PayPal charges the vaulted wallet; the purse never held the money." },
    { target: "nav-Shop", title: "Shop real offers", body: "Search the catalog, ask the clerk about an offer, or set a price watch that files a normal request when the price drops." },
    { target: "nav-Guard", title: "Hidden instructions get caught", body: "A page that tells an agent to buy something else is blocked. The guard compares every purchase with what was actually asked." },
    { target: "nav-Controls", title: "Kill switch", body: "Panic freeze stops every payment. Revoke deletes the PayPal token. Reset demo puts Maaz's purse back." },
    {
      title: "Want your own purse?",
      body: "Sign up with email. A setup checklist walks you through linking PayPal, picking an agent template, and connecting your AI.",
      actions: (
        <>
          <button type="button" className="btn secondary !min-h-10" onClick={close}>Keep exploring</button>
          <Link className="btn !min-h-10" href="/signup">Create my purse</Link>
        </>
      ),
    },
  ];
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
