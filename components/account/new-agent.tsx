"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConnectCard } from "@/components/account/connect-card";
import { postJson } from "@/components/post-json";
import { centsToDecimal, decimalToCents, formatMoney } from "@/src/domain/money";
import type { AgentTemplate } from "@/src/domain/templates";
import { CATEGORIES } from "@/src/domain/types";

const PROVIDER_LABELS: Record<string, string> = { claude: "Claude", chatgpt: "ChatGPT", cursor: "Cursor", grok: "Grok", other: "Something else" };

type Created = { id: string; name: string; apiKey: string };

export function NewAgent({ templates, mcpUrl, onCreated }: { templates: AgentTemplate[]; mcpUrl: string; onCreated?: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<AgentTemplate | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked) return;
    const form = new FormData(event.currentTarget);
    const money = (field: string) => decimalToCents(String(form.get(field) ?? ""));
    const amounts = {
      allowanceCents: money("allowance"),
      perTxnCapCents: money("perTxn"),
      dailyCapCents: money("daily"),
      approvalThresholdCents: money("hold"),
    };
    if (Object.values(amounts).some((value) => value === null || value <= 0)) {
      setError("Amounts are dollars like 40 or 12.50, above zero.");
      return;
    }
    const categories = CATEGORIES.filter((category) => form.get(`cat-${category}`) === "on");
    setPending(true);
    setError(null);
    try {
      const payload = await postJson("/api/agents", {
        templateId: picked.id,
        edits: {
          name: String(form.get("name") ?? "").trim(),
          provider: String(form.get("provider") ?? "other"),
          description: String(form.get("description") ?? "").trim(),
          allowedCategories: categories,
          trustedMerchantsOnly: form.get("trusted") === "on",
          ...amounts,
        },
      });
      const agent = payload.agent as { id: string; name: string };
      setCreated({ id: agent.id, name: agent.name, apiKey: String(payload.apiKey) });
      setPicked(null);
      onCreated?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the agent.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <section className="panel" aria-label="Connect your new agent">
        <p className="eyebrow">Agent created</p>
        <h2 className="mt-1 text-2xl">Connect {created.name} to your AI</h2>
        <p className="mt-1 text-sm text-muted">Copy the prompt below into your AI. It adds the AgentPurse connection and the spending rules.</p>
        <div className="mt-4">
          <ConnectCard agentId={created.id} agentName={created.name} mcpUrl={mcpUrl} apiKey={created.apiKey} />
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => setCreated(null)}>I saved the key</button>
        </div>
      </section>
    );
  }

  if (picked) {
    const field = (cents: number) => centsToDecimal(cents);
    return (
      <section className="panel" aria-label={`Set up ${picked.name}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Template · {picked.name}</p>
            <h2 className="mt-1 text-2xl">Make it yours</h2>
          </div>
          <button type="button" className="btn secondary" onClick={() => setPicked(null)}>Back to templates</button>
        </div>
        <p className="mt-1 text-sm text-muted">Keep the numbers or change them. The clerk enforces exactly what you save.</p>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <div>
            <label htmlFor="agent-name">Agent name</label>
            <input id="agent-name" name="name" defaultValue={picked.name} maxLength={40} required />
          </div>
          <div>
            <label htmlFor="agent-provider">Which AI runs it</label>
            <select id="agent-provider" name="provider" defaultValue="claude">
              {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="agent-description">What it does</label>
            <input id="agent-description" name="description" defaultValue={picked.description} maxLength={200} />
          </div>
          <MoneyField id="allowance" label="Total allowance" hint="All it can spend until you top it up." value={field(picked.allowanceCents)} />
          <MoneyField id="perTxn" label="Most per payment" value={field(picked.perTxnCapCents)} />
          <MoneyField id="daily" label="Most per day" value={field(picked.dailyCapCents)} />
          <MoneyField id="hold" label="Ask me above" hint="Payments over this wait for your signature." value={field(picked.approvalThresholdCents)} />
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">What it may buy</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {CATEGORIES.map((category) => (
                <label key={category} className="!m-0 inline-flex items-center gap-2 text-sm font-normal capitalize">
                  <input type="checkbox" className="!w-auto" name={`cat-${category}`} defaultChecked={picked.allowedCategories.includes(category)} />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="!m-0 inline-flex items-center gap-2 text-sm font-normal sm:col-span-2">
            <input type="checkbox" className="!w-auto" name="trusted" defaultChecked={picked.trustedMerchantsOnly} />
            Ask me before paying any store I have not marked as trusted
          </label>
          <div className="sm:col-span-2">
            <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create agent"}</button>
            {error ? <p className="mt-3 text-sm text-deny" role="alert">{error}</p> : null}
          </div>
        </form>
      </section>
    );
  }

  return (
    <section aria-label="Agent templates">
      <h2 className="text-2xl">Start from a template</h2>
      <p className="mt-1 text-sm text-muted">Pick one, change anything, then connect it to your AI.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="panel cursor-pointer text-left transition hover:-translate-y-0.5"
            onClick={() => setPicked(template)}
          >
            <p className="eyebrow">{template.tagline}</p>
            <h3 className="mt-1 text-xl">{template.name}</h3>
            <p className="mt-2 text-sm text-muted">{template.description}</p>
            <p className="money mt-3 text-xs text-muted">
              {formatMoney(template.allowanceCents)} · asks above {formatMoney(template.approvalThresholdCents)}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function MoneyField({ id, label, hint, value }: { id: string; label: string; hint?: string; value: string }) {
  return (
    <div>
      <label htmlFor={`agent-${id}`}>{label}, USD</label>
      <input id={`agent-${id}`} name={id} inputMode="decimal" defaultValue={value} pattern="\d+(\.\d{1,2})?" required />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
