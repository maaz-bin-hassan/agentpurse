"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";

export function RefundButton({ spendId, label }: { spendId: string; label: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="row">
      <span>{label}</span>
      <button
        className="btn secondary"
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setMessage(null);
          void postJson(`/api/spends/${spendId}/refund`)
            .then((payload) => {
              setMessage(typeof payload.explanation === "string" ? payload.explanation : "Refunded.");
              router.refresh();
            })
            .catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : "Refund failed.");
            })
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Refunding…" : "Refund"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
