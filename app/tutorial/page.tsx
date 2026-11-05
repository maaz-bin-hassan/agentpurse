import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ConnectCard } from "@/components/account/connect-card";
import { DemoVideo } from "@/components/demo-video";
import { SiteHeader } from "@/components/site-header";
import { paypalMode, publicBaseUrl } from "@/src/config";
import { AGENT_TEMPLATES } from "@/src/domain/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Tutorial · AgentPurse", description: "Set up a purse, give an agent an allowance, and connect it to Claude, Cursor, or Grok." };

const STEPS = [
  {
    title: "Create your account",
    body: (
      <>
        <Link href="/signup">Sign up</Link> with your email and a password, then open the link we email you. It lands on your dashboard. Your purse starts empty: no agents, no PayPal, nothing can be spent.
      </>
    ),
  },
  {
    title: "Link PayPal",
    body: "On Setup, press Sign in with PayPal. PayPal saves your wallet and gives AgentPurse a token. AgentPurse never holds your money; an allowance is only a number the clerk checks before PayPal charges you. Revoke on Controls deletes the token at PayPal.",
  },
  {
    title: "Create an agent from a template",
    body: `Open Agents and pick one of ${AGENT_TEMPLATES.length} templates: ${AGENT_TEMPLATES.map((t) => t.name).join(", ")}. Change its name, allowance, per-payment and daily caps, the amount above which it must ask you, and the categories it may buy. Save it and copy the key it shows. The key is shown once.`,
  },
  {
    title: "Connect your AI",
    body: "Copy the ready-made prompt below into Claude, Cursor, Grok, or any agent that can add MCP servers. It adds the AgentPurse server with your agent's key and teaches the agent the spending rules. The dashboard fills in your real key; here it is a placeholder.",
  },
  {
    title: "Ask it to buy something",
    body: 'Say "Buy oat milk and eggs from Green Grocer for $18.40." The agent asks for a quote, then asks the clerk. Under your hold amount it is paid. Over it, a cheque waits on your dashboard until you press Approve and pay.',
  },
  {
    title: "Keep the off switch close",
    body: "Pause stops one agent. Panic freeze stops every payment. Revoke deletes the PayPal token. A hidden instruction on a web page cannot buy anything: the guard compares every purchase with what you actually asked for.",
  },
];

export default async function TutorialPage() {
  const head = await headers();
  const origin = `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host") ?? "localhost:3000"}`;
  const mcpUrl = `${publicBaseUrl(origin)}/mcp`;
  return (
    <main className="shell !max-w-4xl">
      <SiteHeader aside={<Link href="/login">Sign in</Link>} />
      <p className="eyebrow">Tutorial · about five minutes</p>
      <h1 className="mt-2 text-5xl leading-tight">Give an agent a purse</h1>
      <p className="lede mt-3">Your agent asks to spend in plain English. A clerk written in plain code allows it, holds it for you, or refuses. PayPal moves the money.</p>
      {paypalMode() === "live" ? (
        <p className="mt-4 rounded-lg border border-line bg-card px-4 py-3 text-sm">This site runs on the PayPal sandbox. Use a PayPal sandbox account; no real money moves.</p>
      ) : (
        <p className="mt-4 rounded-lg border border-line bg-card px-4 py-3 text-sm">This copy runs on mock PayPal. Linking is instant and no money moves.</p>
      )}

      <section className="mt-8" aria-label="Demo video">
        <h2 className="text-2xl">Watch it first</h2>
        <p className="mt-1 text-sm text-muted">The whole flow in one short video, then follow the steps below.</p>
        <DemoVideo className="mt-4" />
      </section>

      <ol className="mt-10 space-y-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid gap-4 sm:grid-cols-[3rem_minmax(0,1fr)]">
            <span className="font-serif text-4xl text-brass tabular-nums" aria-hidden>{index + 1}</span>
            <div>
              <h2 className="text-2xl">{step.title}</h2>
              <p className="mt-2 max-w-2xl text-muted">{step.body}</p>
              {index === 3 ? (
                <div className="panel mt-4">
                  <ConnectCard agentName="Grocery runner" mcpUrl={mcpUrl} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link className="btn" href="/signup">Create your purse</Link>
        <Link className="btn secondary" href="/purses/purse_maaz">Try the demo first</Link>
      </div>
    </main>
  );
}
