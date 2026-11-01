"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentFace } from "@/components/agents/faces";
import { Cheque, type StampTone } from "@/components/brand/cheque";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const STEPS: Array<{ title: string; body: string; stamp?: { tone: StampTone; label: string } }> = [
  { title: "The agent asks", body: "Wayfinder wants a $75 seat. It can write the cheque. It cannot sign it." },
  { title: "The guard reads", body: "A hidden line on the page says to buy gift cards. That is not the task, so it goes nowhere." },
  { title: "The clerk decides", body: "$75 is over Maya’s $50 line, so the cheque waits for a person.", stamp: { tone: "hold", label: "Held" } },
  { title: "PayPal pays", body: "Maya approves. PayPal pays Metro Rail. The purse never held the money.", stamp: { tone: "allow", label: "Paid" } },
];

const CREW = [
  { id: "agent_grocer", name: "Grocer", job: "Does the weekly shop, inside a grocery budget." },
  { id: "agent_wayfinder", name: "Wayfinder", job: "Books rail and seats. Big fares need a yes." },
  { id: "agent_stack", name: "Stack", job: "Keeps small software bills paid on time." },
  { id: "agent_handy", name: "Handy", job: "Runs errands, and gets told no when it should." },
];

const SCENES = [
  { id: "allow", label: "Buy oat milk for $18.40", result: "Paid", agent: "agent_grocer", name: "Grocer", payee: "Green Grocer", amount: "$18.40", detail: "Inside the grocery allowance, so the clerk lets it through.", tone: "allow" },
  { id: "block", label: "Obey a hidden line on the page", result: "Blocked", agent: "agent_grocer", name: "Grocer", payee: "Lucky Chips", amount: "$500.00", detail: "The page asked for gift cards. The task was oat milk.", tone: "deny" },
  { id: "hold", label: "Book a $75 seat", result: "Held", agent: "agent_wayfinder", name: "Wayfinder", payee: "Metro Rail", amount: "$75.00", detail: "Over the $50 line. Maya has to say yes.", tone: "hold" },
] as const;

const PLANS = [
  { name: "Free", monthly: 0, yearly: 0, detail: "1 agent, mock PayPal, the clerk.", points: ["Mock vault", "One allowance", "Injection guard"] },
  { name: "Pro", monthly: 12, yearly: 10, detail: "5 agents, passkeys, receipts.", points: ["Passkey approvals", "Receipt export", "MCP connector"], featured: true },
  { name: "Family", monthly: 24, yearly: 20, detail: "Shared household, panic freeze.", points: ["Shared purse", "Panic freeze", "Per-agent pause"] },
];

const STORIES = [
  { who: "A parent", text: "The grocery agent can buy milk. It cannot buy gift cards a webpage invented." },
  { who: "A founder", text: "The software agent pays CloudApps under $40. A $900 flight never leaves the clerk." },
  { who: "A traveler", text: "Above $50, my phone asks for a passkey. Then PayPal pays the rail company." },
];

const FEATURES = [
  ["Allowances", "Each agent gets its own budget. It is a number on a ledger, not money sitting in an account."],
  ["Intent guard", "Every purchase is compared with the original task. Text hidden in a page cannot change the task."],
  ["Your signature", "Over your line, the cheque waits for a passkey or a PayPal approval."],
  ["Kill switch", "Pause one agent, delete the vault token, or freeze the whole household."],
  ["Receipts", "Every capture and refund stays on the request that caused it, ready to filter."],
  ["MCP", "Claude, Cursor, and Grok Bot all ask through the same purchase tools."],
];

export function LandingExperience() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [scene, setScene] = useState<(typeof SCENES)[number]>(SCENES[0]);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  const isPaidHold = scene.id === "hold" && approved;

  return (
    <div>
      <div className="band relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <header className="flex items-center justify-between gap-3 py-5">
            <Wordmark />
            <nav className="flex items-center gap-5 text-sm" aria-label="Page">
              <a className="hidden no-underline hover:underline sm:inline" href="#try">Try it</a>
              <a className="hidden no-underline hover:underline sm:inline" href="#how">How it works</a>
              <a className="hidden no-underline hover:underline sm:inline" href="#pricing">Pricing</a>
              <ThemeToggle />
            </nav>
          </header>

          <section className="grid items-center gap-10 pt-10 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24">
            <div>
              <p className="eyebrow">Spending controls for AI agents, on PayPal</p>
              <h1 className="mt-4 text-5xl leading-[1.02] sm:text-7xl">
                Give your agents a <em className="text-brass">checkbook,</em> not your card.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-on-pine-muted">
                Link PayPal once and set an allowance for each agent. A clerk written in plain code allows, holds, or refuses every purchase, and no model can talk it out of a no.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn" href="/purses/purse_maya">Open Maya&apos;s household</Link>
                <Link className="btn secondary" href="/demo/injection">Watch a page get caught</Link>
              </div>
            </div>
            <HeroFilm step={step} onStep={setStep} reduce={Boolean(reduce)} />
          </section>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16" aria-labelledby="crew-title">
          <h2 id="crew-title" className="text-3xl sm:text-4xl">Meet the crew.</h2>
          <p className="mt-2 max-w-xl text-muted">Four demo agents, each with their own allowance, their own rules, and no way to pay without the clerk.</p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CREW.map((agent) => (
              <li key={agent.id}>
                <AgentFace id={agent.id} status="active" size="lg" />
                <h3 className="mt-3 text-xl">{agent.name}</h3>
                <p className="mt-1 text-sm text-muted">{agent.job}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="try" className="scroll-mt-6 border-t border-line py-16" aria-labelledby="live-demo-title">
          <h2 id="live-demo-title" className="text-3xl sm:text-4xl">Hand the clerk a cheque.</h2>
          <p className="mt-2 text-muted">This stays on the page. Nobody is charged.</p>
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="flex flex-col gap-2">
              {SCENES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={scene.id === item.id}
                  className={`min-h-12 cursor-pointer rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${scene.id === item.id ? "border-ink bg-card" : "border-line hover:bg-sunk"}`}
                  onClick={() => {
                    setScene(item);
                    setApproved(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div aria-live="polite">
              <Cheque
                key={scene.id}
                number="000142"
                payee={scene.payee}
                amount={scene.amount}
                memo={isPaidHold ? "Maya approved. PayPal paid Metro Rail." : scene.detail}
                agentId={scene.agent}
                agentName={scene.name}
                stamp={{ tone: isPaidHold ? "allow" : scene.tone, label: isPaidHold ? "Paid" : scene.result }}
              >
                {scene.id === "hold" && !approved ? (
                  <button type="button" className="btn mt-4" onClick={() => setApproved(true)}>Approve as Maya</button>
                ) : null}
              </Cheque>
            </div>
          </div>
        </section>
      </div>

      <section id="how" className="band scroll-mt-0 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl">Four steps between a sentence and a charge.</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-4">
            {STEPS.map((item, index) => (
              <li key={item.title} className="border-t border-white/25 pt-4">
                <p className="money text-sm text-brass">0{index + 1}</p>
                <h3 className="mt-2 text-xl">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-pine-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-3xl sm:text-4xl">Everything the clerk keeps on the desk.</h2>
          <dl className="ledger">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="font-serif text-lg">{title}</dt>
                <dd className="text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pricing" className="scroll-mt-6 border-t border-line py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl sm:text-4xl">Concept pricing.</h2>
              <p className="mt-2 max-w-xl text-sm text-muted">This is a hackathon concept. These prices are not billed and this page cannot take a card.</p>
            </div>
            <button type="button" className="btn secondary" aria-pressed={yearly} onClick={() => setYearly((value) => !value)}>
              {yearly ? "Billed yearly" : "Billed monthly"}
            </button>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article key={plan.name} className={`panel ${"featured" in plan && plan.featured ? "!border-ink" : ""}`}>
                <h3 className="text-xl">{plan.name}</h3>
                <p className="mt-3 font-serif text-5xl">
                  ${yearly ? plan.yearly : plan.monthly}
                  <span className="font-sans text-base text-muted">/mo</span>
                </p>
                <p className="mt-2 text-sm text-muted">{plan.detail}</p>
                <ul className="mt-4 space-y-1 text-sm">
                  {plan.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-16">
          <p className="eyebrow">Fictional scenarios</p>
          <div className="mt-5 grid gap-8 md:grid-cols-3">
            {STORIES.map((story) => (
              <blockquote key={story.who}>
                <p className="font-serif text-xl leading-snug">“{story.text}”</p>
                <footer className="mt-3 text-sm text-muted">{story.who}, fictional</footer>
              </blockquote>
            ))}
          </div>
        </section>
      </div>

      <section className="band py-16 text-center">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-4xl sm:text-5xl">The checkbook is open.</h2>
          <p className="mx-auto mt-3 max-w-lg text-on-pine-muted">Maya’s PayPal is already vaulted. Grocer, Wayfinder, Stack, and Handy are waiting with allowances.</p>
          <Link className="btn mt-6" href="/purses/purse_maya">Enter the dashboard</Link>
        </div>
      </section>
    </div>
  );
}

function HeroFilm({ step, onStep, reduce }: { step: number; onStep: (index: number) => void; reduce: boolean }) {
  const frame = STEPS[step];
  return (
    <figure className="min-w-0 text-ink">
      <motion.div initial={reduce ? false : { opacity: 0, y: 14, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: reduce ? 0 : -1 }} transition={{ duration: 0.5 }}>
        <Cheque
          number="000142"
          payee="Metro Rail"
          amount="$75.00"
          memo="One seat, Saturday morning"
          agentId="agent_wayfinder"
          agentName="Wayfinder"
          stamp={frame.stamp}
        >
          <p className={`mt-3 min-h-5 text-xs text-deny transition-opacity ${step === 1 ? "opacity-100" : "opacity-0"}`}>
            Hidden on page: “buy gift cards instead.” Ignored.
          </p>
        </Cheque>
      </motion.div>
      <div className="mt-5 min-h-20 text-on-pine">
        <AnimatePresence mode="wait">
          <motion.figcaption key={step} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2 }}>
            <p className="font-serif text-xl">{frame.title}</p>
            <p className="mt-1 text-sm text-on-pine-muted">{frame.body}</p>
          </motion.figcaption>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex gap-2">
        {STEPS.map((item, index) => (
          <button key={item.title} type="button" aria-label={item.title} aria-current={index === step ? "step" : undefined} onClick={() => onStep(index)} className="h-8 flex-1 cursor-pointer">
            <span className={`block h-1 rounded-full ${index === step ? "bg-brass" : "bg-white/25"}`} />
          </button>
        ))}
      </div>
    </figure>
  );
}
