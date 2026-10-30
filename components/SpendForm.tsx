"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/components/post-json";

export function SpendForm({
  agentId,
  agentName,
  description,
  samples,
}: {
  agentId: string;
  agentName: string;
  description: string;
  samples: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(samples[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState("quiet");
  const [pending, setPending] = useState(false);
  const fieldId = `spend-${agentId}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const payload = await postJson(`/api/agents/${agentId}/spend`, { text });
      const spend = payload.spend as { decision?: string } | undefined;
      const decision = spend?.decision ?? "quiet";
      setTone(decision === "allow" ? "allow" : decision === "deny" ? "deny" : decision === "needs_approval" ? "hold" : "quiet");
      setMessage(typeof payload.explanation === "string" ? payload.explanation : "Recorded.");
      router.refresh();
    } catch (error) {
      setTone("deny");
      setMessage(error instanceof Error ? error.message : "The clerk could not read that.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="agent-card" onSubmit={onSubmit}>
      <div className="row">
        <h3 style={{ margin: 0 }}>{agentName}</h3>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {description}
      </p>
      <label htmlFor={fieldId}>Sentence</label>
      <textarea
        id={fieldId}
        name="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        required
      />
      <div className="suggestions" aria-label={`${agentName} examples`}>
        {samples.map((sample) => (
          <button key={sample} type="button" onClick={() => setText(sample)}>
            {sample}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Asking the clerk…" : "Ask the clerk"}
        </button>
      </div>
      {message ? (
        <p className={`form-error`} role="status" data-tone={tone} style={{ color: "inherit" }}>
          <span className={`chip ${tone}`}>{tone === "allow" ? "Allow" : tone === "deny" ? "Deny" : tone === "hold" ? "Hold" : "Note"}</span>{" "}
          {message}
        </p>
      ) : null}
    </form>
  );
}
