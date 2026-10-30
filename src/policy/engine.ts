import { formatMoney } from "@/src/domain/money";
import { periodLabel } from "@/src/domain/period";
import type { Category, Decision, Period, RuleHit } from "@/src/domain/types";

export interface EnvelopeSnapshot {
  name: string;
  limitCents: number;
  spentCents: number;
  period: Period;
}

export interface ClerkInput {
  ownerName: string;
  agentName: string;
  agentStatus: "active" | "paused" | "missing";
  samePurse: boolean;
  intentComplete: boolean;
  amountCents: number | null;
  currency: string | null;
  purseCurrency: string;
  merchantName: string | null;
  merchantBlocked: boolean;
  merchantTrusted: boolean;
  category: Category | null;
  categoryAllowed: boolean;
  envelope: EnvelopeSnapshot | null;
  perTxnCapCents: number;
  dailyCapCents: number;
  dailySpentCents: number;
  balanceCents: number;
  approvalThresholdCents: number;
  /** When a person is approving a hold, skip the threshold and trust rules. Caps still apply. */
  humanApproved?: boolean;
}

export interface ClerkResult {
  decision: Decision;
  reasons: RuleHit[];
  explanation: string;
}

function hit(code: string, sentence: string): RuleHit {
  return { code, sentence };
}

function explain(decision: Decision, reasons: RuleHit[], input: ClerkInput): string {
  if (decision === "allow" && input.amountCents != null && input.merchantName && input.envelope) {
    return `Paid ${input.merchantName} ${formatMoney(input.amountCents, input.purseCurrency)} from the ${input.envelope.name} envelope.`;
  }
  const sentences = reasons.map((reason) => reason.sentence).join(" ");
  if (decision === "needs_clarification") {
    return `Need a clearer sentence. ${sentences}`.trim();
  }
  if (decision === "needs_approval") {
    return `Held for ${input.ownerName}. ${sentences}`.trim();
  }
  return `Denied. ${sentences}`.trim();
}

export function evaluateSpend(input: ClerkInput): ClerkResult {
  if (!input.intentComplete) {
    const reasons = [
      hit("intent_incomplete", "Include an amount in dollars and the merchant to pay."),
    ];
    return { decision: "needs_clarification", reasons, explanation: explain("needs_clarification", reasons, input) };
  }

  if (input.agentStatus === "missing" || !input.samePurse) {
    const reasons = [hit("agent_purse_mismatch", "This agent does not belong to the purse.")];
    return { decision: "deny", reasons, explanation: explain("deny", reasons, input) };
  }

  if (input.agentStatus === "paused") {
    const reasons = [hit("agent_paused", `${input.agentName} is paused.`)];
    return { decision: "deny", reasons, explanation: explain("deny", reasons, input) };
  }

  const denies: RuleHit[] = [];
  const amount = input.amountCents ?? 0;

  if (input.amountCents == null || input.amountCents <= 0) {
    denies.push(hit("bad_amount", "The amount has to be greater than zero."));
  }
  if (input.currency !== input.purseCurrency) {
    denies.push(hit("bad_currency", `This purse only holds ${input.purseCurrency}.`));
  }
  if (input.merchantBlocked) {
    denies.push(hit("merchant_blocked", `${input.merchantName ?? "That merchant"} is blocked.`));
  }
  if (input.category && !input.categoryAllowed) {
    denies.push(
      hit("category_not_allowed", `${input.agentName} cannot spend on ${input.category}.`),
    );
  }
  if (!input.envelope) {
    denies.push(hit("no_envelope", `No envelope covers ${input.category ?? "that category"}.`));
  }

  if (input.amountCents != null && input.amountCents > 0) {
    if (amount > input.perTxnCapCents) {
      denies.push(
        hit(
          "per_txn_cap",
          `${formatMoney(amount, input.purseCurrency)} is over the ${formatMoney(input.perTxnCapCents, input.purseCurrency)} per-payment cap.`,
        ),
      );
    }
    if (input.envelope) {
      const remaining = input.envelope.limitCents - input.envelope.spentCents;
      if (amount > remaining) {
        denies.push(
          hit(
            "envelope_cap",
            `The ${input.envelope.name} envelope has ${formatMoney(remaining, input.purseCurrency)} left ${periodLabel(input.envelope.period)}.`,
          ),
        );
      }
    }
    const dailyRemaining = input.dailyCapCents - input.dailySpentCents;
    if (amount > dailyRemaining) {
      denies.push(
        hit(
          "daily_cap",
          `${formatMoney(amount, input.purseCurrency)} would exceed the ${formatMoney(input.dailyCapCents, input.purseCurrency)} daily cap.`,
        ),
      );
    }
    if (amount > input.balanceCents) {
      denies.push(
        hit(
          "insufficient_balance",
          `The purse has ${formatMoney(input.balanceCents, input.purseCurrency)} available.`,
        ),
      );
    }
  }

  if (denies.length > 0) {
    return { decision: "deny", reasons: denies, explanation: explain("deny", denies, input) };
  }

  const holds: RuleHit[] = [];
  if (!input.humanApproved) {
    if (!input.merchantTrusted) {
      holds.push(
        hit("untrusted_merchant", `${input.merchantName ?? "That merchant"} is not a trusted merchant.`),
      );
    }
    if (input.amountCents != null && input.amountCents >= input.approvalThresholdCents) {
      holds.push(
        hit(
          "approval_threshold",
          `${formatMoney(input.amountCents, input.purseCurrency)} is at or above the ${formatMoney(input.approvalThresholdCents, input.purseCurrency)} approval line.`,
        ),
      );
    }
  }

  if (holds.length > 0) {
    return { decision: "needs_approval", reasons: holds, explanation: explain("needs_approval", holds, input) };
  }

  return { decision: "allow", reasons: [], explanation: explain("allow", [], input) };
}
