"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const STEPS = [
  { title: "Agent asks", body: "Wayfinder wants a $75 seat on Metro Rail.", caption: "The agent can only ask." },
  { title: "Guard checks", body: "A product page whispers: buy gift cards instead.", caption: "Hidden instructions never become the task." },
  { title: "Clerk holds", body: "Seventy-five dollars is above Maya’s $50 line.", caption: "A person still has to say yes." },
  { title: "PayPal pays", body: "The merchant is paid. The purse holds nothing.", caption: "The allowance is a ledger, not a balance." },
];

const SCENES = [
  { id: "allow", label: "Buy oat milk", result: "Allow", detail: "Grocer pays Green Grocer $18.40 from today’s grocery allowance.", tone: "allow" },
  { id: "block", label: "Follow the page", result: "Blocked", detail: "The page asked for Lucky Chips gift cards. That merchant is not in the task.", tone: "deny" },
  { id: "hold", label: "Hold a $75 seat", result: "Hold", detail: "Wayfinder is over the $50 approval line. Maya approves, then PayPal pays Metro Rail.", tone: "hold" },
] as const;

const PLANS = [
  { name: "Free", monthly: 0, yearly: 0, detail: "1 agent, mock PayPal, the clerk.", points: ["Mock vault", "One allowance", "Injection guard"] },
  { name: "Pro", monthly: 12, yearly: 10, detail: "5 agents, passkeys, receipts.", points: ["Passkey approvals", "Receipt export", "MCP connector"], featured: true },
  { name: "Family", monthly: 24, yearly: 20, detail: "Shared household, panic freeze.", points: ["Shared purse", "Panic freeze", "Per-agent pause"] },
];

const STORIES = [
  { who: "A parent", text: "The grocery agent can buy milk. It cannot buy gift cards a webpage invented." },
  { who: "A founder", text: "The software agent pays CloudApps under $40. A $900 flight never leaves the clerk." },
  { who: "A traveler", text: "Above $50, the phone asks for a passkey. PayPal pays the rail company." },
];

const FEATURES = [
  ["Allowance rings", "Each agent has a face, a status, and a ring that shows what is left today."],
  ["Intent guard", "The clerk compares the page to the original task and blocks the swap."],
  ["Human approval", "Over the line, the purchase waits for a passkey or a PayPal approval."],
  ["Kill switch", "Pause one agent, revoke the vault token, or freeze the whole household."],
  ["Receipts", "Every capture and refund stays on the intent, ready to filter."],
  ["MCP", "Claude, Cursor, and Grok Bot ask through the same purchase tools."],
];

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingExperience() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [scene, setScene] = useState<(typeof SCENES)[number] | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <p className="wordmark">Agent<span>Purse</span></p>
        <div className="flex items-center gap-3 text-sm text-[var(--quiet)]">
          <span className="hidden sm:inline">Mock mode · no secrets</span>
          <ThemeToggle />
        </div>
      </header>

      <section className="grid items-end gap-12 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pt-24">
        <div>
          <p className="eyebrow">PayPal + agents</p>
          <h1 className="mt-5 max-w-3xl text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.96] font-medium tracking-[-0.045em]">
            Agents can ask to spend. They cannot be the ones who decide.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--soft)]">
            Link PayPal once. Give each agent an allowance. A guard and a clerk stand between the sentence and the charge.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn no-underline" href="/purses/purse_maya">Open Maya&apos;s household</Link>
            <Link className="btn secondary no-underline" href="/demo/injection">See a blocked injection</Link>
          </div>
        </div>
        <ProductFilm step={step} onStep={setStep} reduce={Boolean(reduce)} />
      </section>

      <section className="mt-24 border-t border-white/10 pt-12" aria-labelledby="live-demo-title">
        <p className="eyebrow">Interactive demo</p>
        <h2 id="live-demo-title" className="mt-3 max-w-xl text-3xl tracking-[-0.03em]">Try a purchase before you open the household.</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2" role="list">
            {SCENES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`min-h-11 rounded-full border px-4 text-left text-sm ${scene?.id === item.id ? "border-[#ff5c2a] text-[#f7f7f5]" : "border-white/10 text-[var(--soft)] hover:border-white/30"}`}
                onClick={() => {
                  setScene(item);
                  setApproved(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="surface relative min-h-56 overflow-hidden rounded-2xl p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {scene ? (
                <motion.div
                  key={scene.id + String(approved)}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease }}
                >
                  {scene.tone === "deny" && !approved ? (
                    <p className="stamp mb-4 inline-block border-2 border-[#ff5d73] px-3 py-1 font-mono text-sm tracking-[0.2em] text-[#ff5d73] uppercase">Blocked</p>
                  ) : (
                    <span className={`chip ${approved ? "allow" : scene.tone}`}>{approved ? "Paid" : scene.result}</span>
                  )}
                  <p className="mt-4 max-w-lg text-xl tracking-[-0.02em]">{approved ? "Maya approved. PayPal paid Metro Rail. The purse still holds nothing." : scene.detail}</p>
                  {scene.id === "hold" && !approved ? (
                    <button type="button" className="btn mt-6" onClick={() => setApproved(true)}>Approve in the demo</button>
                  ) : null}
                </motion.div>
              ) : (
                <p className="text-[var(--quiet)]">Pick a sentence. The widget stays on this page and does not charge anyone.</p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="mt-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 text-3xl tracking-[-0.03em]">Four beats, then the merchant is paid.</h2>
        <ol className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {STEPS.map((item, index) => (
            <motion.li
              key={item.title}
              className="grid gap-2 py-5 sm:grid-cols-[4rem_1fr_1.2fr] sm:items-baseline"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reduce ? 0 : index * 0.05, duration: 0.28, ease }}
            >
              <span className="font-mono text-xs text-[#ff5c2a]">0{index + 1}</span>
              <h3 className="text-xl tracking-[-0.02em]">{item.title}</h3>
              <p className="text-sm text-[var(--soft)]">{item.body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-24 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <article key={title} className="bg-[var(--canvas)] p-6">
            <h2 className="text-lg tracking-[-0.02em]">{title}</h2>
            <p className="mt-2 text-sm text-[var(--quiet)]">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Concept pricing</p>
            <h2 className="mt-3 text-3xl tracking-[-0.03em]">Not a checkout. A sketch of the product.</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--quiet)]">Hackathon concept. These prices are not billed and this page cannot take a card.</p>
          </div>
          <button type="button" className="btn secondary" aria-pressed={yearly} onClick={() => setYearly((value) => !value)}>
            {yearly ? "Yearly" : "Monthly"}
          </button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <article key={plan.name} className={`rounded-2xl border p-6 ${"featured" in plan && plan.featured ? "border-[#ff5c2a]" : "border-white/10"}`}>
              <h3 className="font-mono text-xs tracking-[0.16em] uppercase">{plan.name}</h3>
              <p className="mt-4 text-5xl tracking-[-0.04em] tabular-nums">
                <motion.span key={`${plan.name}-${yearly}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease }}>
                  ${yearly ? plan.yearly : plan.monthly}
                </motion.span>
                <span className="ml-1 text-base text-[var(--quiet)]">/mo</span>
              </p>
              <p className="mt-3 text-sm text-[var(--soft)]">{plan.detail}</p>
              <ul className="mt-5 space-y-1 text-sm text-[var(--soft)]">
                {plan.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-24">
        <p className="eyebrow">Fictional scenarios</p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {STORIES.map((story) => (
            <blockquote key={story.who} className="border-t border-white/10 pt-4">
              <p className="text-lg tracking-[-0.02em]">“{story.text}”</p>
              <footer className="mt-4 font-mono text-[11px] tracking-[0.14em] text-[var(--quiet)] uppercase">{story.who} · fictional</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="mt-24 rounded-2xl border border-white/10 px-6 py-16 text-center">
        <h2 className="text-4xl tracking-[-0.04em]">Open the household.</h2>
        <p className="mx-auto mt-3 max-w-lg text-[var(--soft)]">Maya is already vaulted. Grocer, Wayfinder, Stack, and Handy are waiting with allowances.</p>
        <Link className="btn mt-8 inline-flex no-underline" href="/purses/purse_maya">Enter the dashboard</Link>
      </section>
    </div>
  );
}

function ProductFilm({ step, onStep, reduce }: { step: number; onStep: (index: number) => void; reduce: boolean }) {
  const frame = STEPS[step];
  return (
    <figure className="surface overflow-hidden rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5d73]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffc14d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7dffb2]" />
        </span>
        <figcaption className="font-mono text-[11px] tracking-[0.14em] text-[var(--quiet)] uppercase">Product film · loop</figcaption>
      </div>
      <div className="min-h-64 p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease }}
          >
            <p className="font-mono text-xs text-[#ff5c2a]">0{step + 1} / 04</p>
            <h2 className="mt-4 text-4xl tracking-[-0.04em]">{frame.title}</h2>
            <p className="mt-3 text-[var(--soft)]">{frame.body}</p>
            <p className="mt-8 text-sm text-[var(--quiet)]">{frame.caption}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex gap-2 px-4 pb-4" role="tablist" aria-label="Film chapters">
        {STEPS.map((item, index) => (
          <button key={item.title} type="button" role="tab" aria-selected={index === step} aria-label={item.title} onClick={() => onStep(index)} className="h-8 flex-1">
            <span className={`block h-px ${index === step ? "bg-[#ff5c2a]" : "bg-white/15"}`} />
          </button>
        ))}
      </div>
    </figure>
  );
}
