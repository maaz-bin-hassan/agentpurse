"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";

export function HoldActions({
  spendId,
  title,
  explanation,
}: {
  spendId: string;
  title: string;
  explanation: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const noteId = `note-${spendId}`;

  async function decide(path: "approve" | "deny") {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postJson(`/api/spends/${spendId}/${path}`, { note });
      setMessage(typeof payload.explanation === "string" ? payload.explanation : "Recorded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the hold.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article>
      <div className="row">
        <strong>{title}</strong>
        <span className="chip hold">Hold</span>
      </div>
      <p>{explanation}</p>
      <label htmlFor={noteId}>Note</label>
      <input id={noteId} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for the ledger" />
      <div className="actions">
        <button className="btn" type="button" disabled={pending} onClick={() => void decide("approve")}>
          Approve and pay
        </button>
        <button className="btn secondary" type="button" disabled={pending} onClick={() => void decide("deny")}>
          Deny
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}
