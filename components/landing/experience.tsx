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

export function LandingExperience() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [scene, setScene] = useState<(typeof SCENES)[number] | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 2800);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-12 flex items-center justify-between">
        <p className="text-lg tracking-tight">Agent<span className="text-violet">Purse</span></p>
        <div className="flex items-center gap-3 text-sm text-[#9aa3b8]">
          <span className="hidden sm:inline">Mock mode · no secrets</span>
          <ThemeToggle />
        </div>
      </header>

      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-xs tracking-[0.22em] text-violet uppercase">PayPal + agents</p>
          <h1 className="mt-4 text-4xl leading-[1.02] tracking-tight sm:text-6xl">
            Agents can ask to spend. They cannot be the ones who decide.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[#b7c0d4]">
            Link PayPal once. Give each agent an allowance. A guard and a clerk stand between the sentence and the charge.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="btn no-underline" href="/purses/purse_maya">Open Maya&apos;s household</Link>
            <Link className="btn secondary no-underline" href="/demo/injection">See a blocked injection</Link>
          </div>
        </div>
        <ProductFilm step={step} onStep={setStep} reduce={Boolean(reduce)} />
      </section>

      <section className="mt-20" aria-labelledby="live-demo-title">
        <p className="text-xs tracking-[0.18em] text-violet uppercase">Interactive demo</p>
        <h2 id="live-demo-title" className="mt-2 text-3xl tracking-tight">Try a purchase before you open the household.</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-2">
            {SCENES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`min-h-11 rounded-2xl border px-4 py-3 text-left text-sm transition ${scene?.id === item.id ? "border-violet bg-violet/15" : "border-white/10 bg-white/5 hover:border-white/25"}`}
                onClick={() => {
                  setScene(item);
                  setApproved(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="glass min-h-52 rounded-3xl p-6">
            <AnimatePresence mode="wait">
              {scene ? (
                <motion.div key={scene.id + String(approved)} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }}>
                  <span className={`chip ${approved ? "allow" : scene.tone}`}>{approved ? "Paid" : scene.result}</span>
                  <p className="mt-4 text-lg">{approved ? "Maya approved. PayPal paid Metro Rail. The purse still holds nothing." : scene.detail}</p>
                  {scene.id === "hold" && !approved ? (
                    <button type="button" className="btn mt-5" onClick={() => setApproved(true)}>Approve in the demo</button>
                  ) : null}
                </motion.div>
              ) : (
                <p className="text-[#9aa3b8]">Pick a sentence. The widget stays on this page and does not charge anyone.</p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="mt-20">
        <p className="text-xs tracking-[0.18em] text-violet uppercase">How it works</p>
        <h2 className="mt-2 text-3xl tracking-tight">Four beats, then the merchant is paid.</h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-4">
          {STEPS.map((item, index) => (
            <motion.li
              key={item.title}
              className="glass rounded-3xl p-4"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reduce ? 0 : index * 0.08 }}
            >
              <p className="text-sm text-cyan">0{index + 1}</p>
              <h3 className="mt-2 text-xl">{item.title}</h3>
              <p className="mt-2 text-sm text-[#b7c0d4]">{item.body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-20 grid gap-3 md:grid-cols-3">
        {FEATURES.map(([title, body], index) => (
          <motion.article
            key={title}
            className="glass lift rounded-3xl p-5"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : (index % 3) * 0.06 }}
          >
            <h2 className="text-xl">{title}</h2>
            <p className="mt-2 text-sm text-[#b7c0d4]">{body}</p>
          </motion.article>
        ))}
      </section>

      <section className="mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] text-violet uppercase">Concept pricing</p>
            <h2 className="mt-2 text-3xl tracking-tight">Not a checkout. A sketch of the product.</h2>
            <p className="mt-2 max-w-xl text-sm text-[#9aa3b8]">Hackathon concept. These prices are not billed and this page cannot take a card.</p>
          </div>
          <button type="button" className="btn secondary" aria-pressed={yearly} onClick={() => setYearly((value) => !value)}>
            {yearly ? "Yearly" : "Monthly"}
          </button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => (
            <article key={plan.name} className={`glass rounded-3xl p-5 ${"featured" in plan && plan.featured ? "ring-1 ring-violet shadow-[0_0_40px_rgba(139,124,255,0.25)]" : ""}`}>
              <h3 className="text-xl">{plan.name}</h3>
              <p className="mt-3 text-4xl tracking-tight">
                <motion.span key={`${plan.name}-${yearly}`} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  ${yearly ? plan.yearly : plan.monthly}
                </motion.span>
                <span className="text-base text-[#9aa3b8]">/mo</span>
              </p>
              <p className="mt-2 text-sm text-[#b7c0d4]">{plan.detail}</p>
              <ul className="mt-4 space-y-1 text-sm text-[#c9d0df]">
                {plan.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <p className="text-xs tracking-[0.18em] text-violet uppercase">Fictional scenarios</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {STORIES.map((story) => (
            <blockquote key={story.who} className="glass rounded-3xl p-5">
              <p className="text-sm leading-relaxed text-[#d5dbeb]">“{story.text}”</p>
              <footer className="mt-4 text-xs tracking-wide text-[#9aa3b8] uppercase">{story.who} · fictional</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="glass relative mt-20 overflow-hidden rounded-[2rem] p-8 text-center sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_180px_at_50%_0%,rgba(139,124,255,0.28),transparent)]" />
        <h2 className="relative text-3xl tracking-tight sm:text-4xl">Open the household.</h2>
        <p className="relative mx-auto mt-3 max-w-lg text-[#b7c0d4]">Maya is already vaulted. Grocer, Wayfinder, Stack, and Handy are waiting with allowances.</p>
        <Link className="btn relative mt-6 inline-flex no-underline" href="/purses/purse_maya">Enter the dashboard</Link>
      </section>
    </div>
  );
}

function ProductFilm({ step, onStep, reduce }: { step: number; onStep: (index: number) => void; reduce: boolean }) {
  const frame = STEPS[step];
  return (
    <figure className="glass relative overflow-hidden rounded-[2rem] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between text-xs tracking-[0.16em] text-[#9aa3b8] uppercase">
        <span>Product film</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose" /> Loop</span>
      </div>
      <div className="relative min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet to-transparent" />
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -14, filter: "blur(6px)" }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-sm text-cyan">0{step + 1} / 04</p>
            <h2 className="mt-3 text-3xl tracking-tight">{frame.title}</h2>
            <p className="mt-2 max-w-sm text-[#c9d0df]">{frame.body}</p>
            <p className="mt-6 text-sm text-[#9aa3b8]">{frame.caption}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <figcaption className="sr-only">Animated walkthrough: an agent asks, the guard catches an injection, and a person approves.</figcaption>
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Film chapters">
        {STEPS.map((item, index) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            aria-selected={index === step}
            aria-label={item.title}
            onClick={() => onStep(index)}
            className="h-8 flex-1"
          >
            <span className={`block h-1.5 rounded-full ${index === step ? "bg-violet" : "bg-white/15"}`} />
          </button>
        ))}
      </div>
    </figure>
  );
}
