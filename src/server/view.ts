import type { DatabaseSync } from "node:sqlite";
import type { Decision } from "@/src/domain/types";
import {
  envelopeSpentCents,
  getPurse,
  listAgents,
  listAudit,
  listEnvelopes,
  listPaypalOrders,
  listPurses,
  listSpends,
} from "@/src/db/repository";

export interface LedgerRow {
  id: string;
  at: string;
  title: string;
  detail: string;
  amountCents: number | null;
  effect: "credit" | "debit" | "none";
  tone: "allow" | "deny" | "hold" | "quiet";
}

function toneFor(decision: Decision | null, status: string): LedgerRow["tone"] {
  if (status === "pending_approval" || decision === "needs_approval") return "hold";
  if (status === "denied" || decision === "deny") return "deny";
  if (status === "needs_clarification" || decision === "needs_clarification") return "quiet";
  if (status === "refunded") return "quiet";
  return "allow";
}

export function loadPurseView(db: DatabaseSync, purseId: string, now = new Date()) {
  const purse = getPurse(db, purseId);
  if (!purse) return null;
  const agents = listAgents(db, purseId);
  const agentName = new Map(agents.map((agent) => [agent.id, agent.name]));
  const envelopes = listEnvelopes(db, purseId).map((envelope) => {
    const spentCents = envelopeSpentCents(db, envelope.id, envelope.period, now);
    return {
      ...envelope,
      spentCents,
      remainingCents: envelope.limitCents - spentCents,
    };
  });
  const spends = listSpends(db, purseId);
  const ledger: LedgerRow[] = [];

  for (const order of listPaypalOrders(db, purseId)) {
    if (order.kind !== "topup" || order.status !== "COMPLETED") continue;
    ledger.push({
      id: order.id,
      at: order.updatedAt,
      title: "PayPal top-up",
      detail: order.id,
      amountCents: order.amountCents,
      effect: "credit",
      tone: "allow",
    });
  }

  for (const spend of spends) {
    const who = agentName.get(spend.agentId) ?? "Agent";
    const title = spend.merchantName ? `${who} · ${spend.merchantName}` : `${who} · unclear request`;
    if (spend.status === "refunded" && spend.amountCents != null) {
      ledger.push({
        id: `${spend.id}:capture`,
        at: spend.createdAt,
        title,
        detail: spend.rawText,
        amountCents: spend.amountCents,
        effect: "debit",
        tone: "allow",
      });
      ledger.push({
        id: `${spend.id}:refund`,
        at: spend.updatedAt,
        title: `Refund · ${spend.merchantName ?? who}`,
        detail: spend.explanation ?? "Refunded to the purse.",
        amountCents: spend.amountCents,
        effect: "credit",
        tone: "quiet",
      });
      continue;
    }
    ledger.push({
      id: spend.id,
      at: spend.createdAt,
      title,
      detail: spend.explanation ?? spend.rawText,
      amountCents: spend.amountCents,
      effect: spend.status === "captured" ? "debit" : "none",
      tone: toneFor(spend.decision, spend.status),
    });
  }

  ledger.sort((a, b) => b.at.localeCompare(a.at));
  const audit = listAudit(db, purseId);

  return {
    purse,
    envelopes,
    agents,
    holds: spends.filter((spend) => spend.status === "pending_approval"),
    captured: spends.filter((spend) => spend.status === "captured"),
    ledger,
    latest: audit[0] ?? null,
  };
}

export function listPurseSummaries(db: DatabaseSync) {
  return listPurses(db);
}
