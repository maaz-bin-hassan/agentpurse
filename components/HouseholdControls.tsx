"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";

export function HouseholdControls({ ownerId, panic, vaultStatus }: { ownerId: string; panic: boolean; vaultStatus: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(url: string, body?: unknown) {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postJson(url, body);
      setMessage(typeof payload.explanation === "string" ? payload.explanation : "Done.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="actions">
        <button className="btn" type="button" disabled={pending} onClick={() => void run(`/api/households/${ownerId}/panic`, { frozen: !panic })}>
          {panic ? "Clear panic freeze" : "Panic freeze"}
        </button>
        <button className="btn secondary" type="button" disabled={pending || vaultStatus !== "vaulted"} onClick={() => void run(`/api/households/${ownerId}/revoke`)}>
          Revoke PayPal
        </button>
        <button className="btn secondary" type="button" disabled={pending} onClick={() => void run("/api/demo/reset")}>
          Reset demo
        </button>
        {vaultStatus !== "vaulted" ? (
          <button className="btn secondary" type="button" disabled={pending} onClick={() => void run(`/api/households/${ownerId}/vault`)}>
            Link PayPal
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
