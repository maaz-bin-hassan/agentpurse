"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";

export function AgentPause({ agentId, paused }: { agentId: string; paused: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="btn secondary"
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void postJson(`/api/agents/${agentId}/pause`, { paused: !paused })
          .then(() => router.refresh())
          .finally(() => setPending(false));
      }}
    >
      {paused ? "Resume agent" : "Pause agent"}
    </button>
  );
}
