"use client";

import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/components/post-json";

type Step = { title: string; body: React.ReactNode; done: boolean; action?: React.ReactNode };

export function SetupChecklist({
  ownerId,
  paypalMode,
  linked,
  agentCount,
  requestCount,
  onGoAgents,
}: {
  ownerId: string;
  paypalMode: "mock" | "live";
  linked: boolean;
  agentCount: number;
  requestCount: number;
  onGoAgents: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function linkPaypal() {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postJson(`/api/households/${ownerId}/vault`);
      if (typeof payload.approveUrl === "string" && payload.approveUrl) {
        window.location.assign(payload.approveUrl);
        return;
      }
      setMessage(typeof payload.explanation === "string" ? payload.explanation : "PayPal linked.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PayPal did not link.");
    } finally {
      setPending(false);
    }
  }

  const steps: Step[] = [
    {
      title: "Link PayPal",
      body:
        paypalMode === "live"
          ? "You sign in at PayPal once. PayPal saves your wallet; AgentPurse keeps only a token and never holds money. This site uses the PayPal sandbox, so use a sandbox account."
          : "This copy runs on mock PayPal. Linking is instant and no money moves.",
      done: linked,
      action: linked ? null : (
        <button type="button" className="btn" disabled={pending} onClick={() => void linkPaypal()}>
          {paypalMode === "live" ? "Sign in with PayPal" : "Link mock PayPal"}
        </button>
      ),
    },
    {
      title: "Create an agent",
      body: "Pick one of eight templates. Set its allowance, its per-payment and daily caps, and when it must ask you.",
      done: agentCount > 0,
      action: (
        <button type="button" className={agentCount > 0 ? "btn secondary" : "btn"} onClick={onGoAgents}>
          {agentCount > 0 ? "Add another" : "Pick a template"}
        </button>
      ),
    },
    {
      title: "Connect your AI",
      body: "Copy the ready-made prompt into Claude, Cursor, or Grok. It adds our MCP server with your agent's key and the spending rules.",
      done: requestCount > 0,
      action: (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn secondary" onClick={onGoAgents}>Get the prompt</button>
          <Link className="btn secondary" href="/tutorial">Read the tutorial</Link>
        </div>
      ),
    },
    {
      title: "Make a first request",
      body: 'Ask your AI to buy something small, or use "Ask the clerk" on the Agents tab. Anything above your hold amount shows up here for your signature.',
      done: requestCount > 0,
    },
  ];
  const left = steps.filter((step) => !step.done).length;
  const next = steps.findIndex((step) => !step.done);

  return (
    <section className="panel" aria-label="Setup">
      <p className="eyebrow">{left === 0 ? "All set" : `${left} step${left === 1 ? "" : "s"} left`}</p>
      <h2 className="mt-1 text-2xl">Set up your purse</h2>
      <ol className="ledger mt-4">
        {steps.map((step, index) => (
          <li key={step.title} className={`flex gap-3 py-4 ${index === next ? "-mx-3 rounded-lg bg-sunk px-3" : ""}`}>
            {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-allow" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-label="To do" />}
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-2 text-lg">
                {index + 1}. {step.title}
                {index === next ? <span className="nudge inline-flex items-center gap-1 rounded-full bg-brass px-2 py-0.5 font-sans text-xs font-semibold text-[#14261f]">Start here <ArrowRight className="h-3 w-3" aria-hidden /></span> : null}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{step.body}</p>
              {step.action ? <div className="mt-3">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
    </section>
  );
}
