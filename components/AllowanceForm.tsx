"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";
import { decimalToCents } from "@/src/domain/money";

export function AllowanceForm({ agentId, agentName }: { agentId: string; agentName: string }) {
  const router = useRouter();
  const [dollars, setDollars] = useState("20");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = `allowance-${agentId}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const cents = decimalToCents(dollars);
        if (cents == null || cents <= 0) {
          setMessage("Enter a dollar amount like 20 or 15.50.");
          return;
        }
        setPending(true);
        setMessage(null);
        void postJson(`/api/agents/${agentId}/allowance`, { amountCents: cents })
          .then(() => {
            setMessage(`Raised ${agentName}'s ledger allowance. PayPal was not charged.`);
            router.refresh();
          })
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not raise the allowance."))
          .finally(() => setPending(false));
      }}
    >
      <label htmlFor={fieldId}>Raise {agentName}'s allowance</label>
      <input id={fieldId} inputMode="decimal" value={dollars} onChange={(event) => setDollars(event.target.value)} />
      <p className="muted">A ledger cap. This does not move money.</p>
      <button className="btn secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Raise allowance"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
