"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";

export function HoldActions({
  spendId,
  title,
  explanation,
  onApproved,
}: {
  spendId: string;
  title: string;
  explanation: string;
  onApproved?: () => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const noteId = `note-${spendId}`;

  async function decide(path: "paypal" | "deny") {
    setPending(true);
    setMessage(null);
    try {
      if (path === "paypal") {
        const started = await postJson(`/api/intents/${spendId}/paypal-approval`, { note });
        const orderId = String(started.orderId ?? "");
        const finished = await postJson(`/api/paypal/orders/${orderId}/finish`);
        setMessage(typeof finished.explanation === "string" ? finished.explanation : "Paid after PayPal approval.");
        setLeaving("right");
        onApproved?.();
      } else {
        const payload = await postJson(`/api/spends/${spendId}/deny`, { note });
        setMessage(typeof payload.explanation === "string" ? payload.explanation : "Recorded.");
        setLeaving("left");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the hold.");
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.article
      className="glass rounded-3xl p-4"
      drag={reduce ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => {
        if (pending) return;
        if (info.offset.x > 120) void decide("paypal");
        if (info.offset.x < -120) void decide("deny");
      }}
      animate={leaving ? { x: leaving === "right" ? 280 : -280, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.35 }}
    >
      <div className="row">
        <strong>{title}</strong>
        <span className="chip hold">Hold</span>
      </div>
      <p className="mt-2 text-sm text-[#c9d0df]">{explanation}</p>
      <p className="mt-1 text-xs text-[#9aa3b8]">Swipe right to approve, left to deny, or use the buttons.</p>
      <label htmlFor={noteId}>Note</label>
      <input id={noteId} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for the ledger" />
      <div className="actions">
        <button className="btn" type="button" disabled={pending} onClick={() => void decide("paypal")}>
          Approve at PayPal
        </button>
        <button className="btn secondary" type="button" disabled={pending} onClick={() => void decide("deny")}>
          Deny
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </motion.article>
  );
}
