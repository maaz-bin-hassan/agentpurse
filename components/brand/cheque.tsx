import type { ReactNode } from "react";
import { AgentFace } from "@/components/agents/faces";

export type StampTone = "allow" | "hold" | "deny" | "quiet";

export function Cheque({
  number,
  payee,
  amount,
  memo,
  agentId,
  agentName,
  status = "active",
  stamp,
  children,
}: {
  number: string;
  payee: string;
  amount: string;
  memo: string;
  agentId: string;
  agentName: string;
  status?: string;
  stamp?: { tone: StampTone; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="cheque p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">AgentPurse checkbook</p>
        <p className="micr">No. {number}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 border-b border-line pb-1">
          <p className="eyebrow">Pay to the order of</p>
          <p className="mt-1 truncate font-serif text-2xl">{payee}</p>
        </div>
        <p className="money rounded border border-line bg-card px-3 py-1.5 text-lg font-medium">{amount}</p>
      </div>
      <p className="mt-3 text-sm text-muted">
        <span className="eyebrow mr-2">Memo</span>
        {memo}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <AgentFace id={agentId} status={status} size="sm" />
        <p className="text-sm">
          <span className="font-serif italic">{agentName}</span>
          <span className="text-muted"> is asking</span>
        </p>
      </div>
      {children}
      {stamp ? (
        <span key={stamp.label} className={`stamp large slam ${stamp.tone} absolute right-4 bottom-4 bg-card/80`}>
          {stamp.label}
        </span>
      ) : null}
    </div>
  );
}
