import { describe, expect, it } from "vitest";
import { evaluateSpend, type ClerkInput } from "@/src/policy/engine";

function base(overrides: Partial<ClerkInput> = {}): ClerkInput {
  return {
    ownerName: "Maya Chen",
    agentName: "Wayfinder",
    agentStatus: "active",
    samePurse: true,
    intentComplete: true,
    amountCents: 4200,
    currency: "USD",
    purseCurrency: "USD",
    merchantName: "Metro Rail",
    merchantBlocked: false,
    merchantTrusted: true,
    category: "travel",
    categoryAllowed: true,
    envelope: { name: "Travel", limitCents: 40000, spentCents: 0, period: "monthly" },
    perTxnCapCents: 15000,
    dailyCapCents: 30000,
    dailySpentCents: 0,
    balanceCents: 23800,
    approvalThresholdCents: 5000,
    ...overrides,
  };
}

describe("purse clerk", () => {
  it("pays a small trusted fare", () => {
    const result = evaluateSpend(base());
    expect(result.decision).toBe("allow");
    expect(result.explanation).toBe("Paid Metro Rail $42.00 from the Travel envelope.");
  });

  it("holds at the approval line", () => {
    const result = evaluateSpend(base({ amountCents: 5000, merchantName: "Metro Rail" }));
    expect(result.decision).toBe("needs_approval");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["approval_threshold"]);
    expect(result.explanation).toContain("Held for Maya Chen");
    expect(result.explanation).toContain("approval line");
  });

  it("holds an untrusted merchant under the line", () => {
    const result = evaluateSpend(
      base({
        agentName: "Handy",
        amountCents: 3000,
        merchantName: "Unknown Gadgets",
        merchantTrusted: false,
        category: "electronics",
        envelope: { name: "Household", limitCents: 10000, spentCents: 0, period: "monthly" },
      }),
    );
    expect(result.decision).toBe("needs_approval");
    expect(result.explanation).toContain("not a trusted merchant");
  });

  it("lists every cap a $900 flight breaks, including the balance", () => {
    const result = evaluateSpend(
      base({
        amountCents: 90000,
        merchantName: "SkyAir",
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "per_txn_cap",
      "envelope_cap",
      "daily_cap",
      "insufficient_balance",
    ]);
    expect(result.explanation).toContain("$900.00 is over the $150.00 per-payment cap.");
    expect(result.explanation).toContain("The Travel envelope has $400.00 left this month.");
    expect(result.explanation).toContain("daily cap");
    expect(result.explanation).toContain("$238.00 available");
  });

  it("denies a category the agent cannot spend", () => {
    const result = evaluateSpend(
      base({
        agentName: "Grocer",
        merchantName: "Unknown Gadgets",
        merchantTrusted: false,
        category: "electronics",
        categoryAllowed: false,
        amountCents: 4000,
        envelope: { name: "Household", limitCents: 10000, spentCents: 0, period: "monthly" },
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.reasons.some((reason) => reason.code === "category_not_allowed")).toBe(true);
    expect(result.explanation).toContain("Grocer cannot spend on electronics");
  });

  it("denies a blocked merchant", () => {
    const result = evaluateSpend(
      base({
        agentName: "Handy",
        merchantName: "Lucky Chips",
        merchantBlocked: true,
        merchantTrusted: false,
        category: "electronics",
        amountCents: 1000,
        envelope: { name: "Household", limitCents: 10000, spentCents: 0, period: "monthly" },
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.explanation).toContain("Lucky Chips is blocked");
  });

  it("asks for a clearer sentence when the intent is incomplete", () => {
    const result = evaluateSpend(base({ intentComplete: false, amountCents: null, merchantName: null }));
    expect(result.decision).toBe("needs_clarification");
    expect(result.explanation).toContain("amount in dollars");
  });

  it("still enforces caps after a human approves", () => {
    const result = evaluateSpend(
      base({
        amountCents: 7500,
        balanceCents: 1000,
        humanApproved: true,
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.reasons.map((reason) => reason.code)).toContain("insufficient_balance");
  });

  it("allows an amount equal to the per-payment cap and below the approval line", () => {
    const result = evaluateSpend(
      base({
        amountCents: 4000,
        perTxnCapCents: 4000,
        approvalThresholdCents: 5000,
        merchantTrusted: true,
      }),
    );
    expect(result.decision).toBe("allow");
  });
});
