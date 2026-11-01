"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cheque } from "@/components/brand/cheque";
import { postJson } from "@/components/post-json";

export function HoldActions({
  spendId,
  title,
  explanation,
  amount,
  agentId,
  agentName,
  onApproved,
}: {
  spendId: string;
  title: string;
  explanation: string;
  amount: string;
  agentId: string;
  agentName: string;
  onApproved?: () => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const noteId = `note-${spendId}`;

  async function decide(path: "approve" | "deny") {
    setPending(true);
    setMessage(null);
    try {
      if (path === "approve") {
        const signed = await postJson(`/api/spends/${spendId}/sign`, { note });
        setMessage(typeof signed.explanation === "string" ? signed.explanation : "Paid.");
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
      drag={reduce ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => {
        if (pending) return;
        if (info.offset.x > 120) void decide("approve");
        if (info.offset.x < -120) void decide("deny");
      }}
      animate={leaving ? { x: leaving === "right" ? 280 : -280, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.35 }}
    >
      <Cheque number={spendId.slice(-6)} payee={title} amount={amount} memo={explanation} agentId={agentId} agentName={agentName}>
        <div className="mt-4 border-t border-dashed border-line pt-3">
          <label htmlFor={noteId}>Note for the ledger</label>
          <input id={noteId} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
          <div className="actions items-center">
            <button className="btn" type="button" disabled={pending} onClick={() => void decide("approve")}>
              Approve and pay
            </button>
            <button className="btn secondary" type="button" disabled={pending} onClick={() => void decide("deny")}>
              Deny
            </button>
            <span className="ml-auto stamp hold">Hold</span>
          </div>
          <p className="mt-2 text-xs text-muted">Or swipe the cheque: right to approve, left to deny.</p>
          {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
        </div>
      </Cheque>
    </motion.article>
  );
}
