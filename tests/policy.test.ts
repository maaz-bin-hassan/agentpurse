import { describe, expect, it } from "vitest";
import { evaluateSpend, type ClerkInput } from "@/src/policy/engine";

function base(overrides: Partial<ClerkInput> = {}): ClerkInput {
  return {
    ownerName: "Maya Chen",
    agentName: "Wayfinder",
    agentStatus: "active",
    panicFrozen: false,
    vaultReady: true,
    intentComplete: true,
    amountCents: 4200,
    currency: "USD",
    purseCurrency: "USD",
    merchantName: "Metro Rail",
    merchantBlocked: false,
    merchantTrusted: true,
    category: "travel",
    categoryAllowed: true,
    perTxnCapCents: 15000,
    dailyCapCents: 30000,
    dailySpentCents: 0,
    allowanceRemainingCents: 40000,
    approvalThresholdCents: 5000,
    ...overrides,
  };
}

describe("purse clerk", () => {
  it("pays a small trusted fare from the agent allowance", () => {
    const result = evaluateSpend(base());
    expect(result.decision).toBe("allow");
    expect(result.explanation).toBe("Paid Metro Rail $42.00 from Wayfinder's allowance.");
  });

  it("holds at the approval line", () => {
    const result = evaluateSpend(base({ amountCents: 5000 }));
    expect(result.decision).toBe("needs_approval");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["approval_threshold"]);
    expect(result.explanation).toContain("Held for Maya Chen");
  });

  it("holds an untrusted merchant under the line", () => {
    const result = evaluateSpend(
      base({
        agentName: "Handy",
        amountCents: 3000,
        merchantName: "Unknown Gadgets",
        merchantTrusted: false,
        category: "electronics",
        categoryAllowed: true,
        allowanceRemainingCents: 10000,
      }),
    );
    expect(result.decision).toBe("needs_approval");
    expect(result.explanation).toContain("not a trusted merchant");
  });

  it("lists every cap a $900 flight breaks", () => {
    const result = evaluateSpend(base({ amountCents: 90000, merchantName: "SkyAir" }));
    expect(result.decision).toBe("deny");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["per_txn_cap", "allowance", "daily_cap"]);
    expect(result.explanation).toContain("$900.00 is over the $150.00 per-payment cap.");
    expect(result.explanation).toContain("Wayfinder has $400.00 of allowance left.");
    expect(result.explanation).toContain("daily cap");
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
        allowanceRemainingCents: 8000,
      }),
    );
    expect(result.decision).toBe("deny");
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
        categoryAllowed: true,
        amountCents: 1000,
        allowanceRemainingCents: 10000,
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.explanation).toContain("Lucky Chips is blocked");
  });

  it("denies every agent while the panic freeze is on", () => {
    const result = evaluateSpend(base({ panicFrozen: true }));
    expect(result.decision).toBe("deny");
    expect(result.reasons[0]?.code).toBe("panic_freeze");
  });

  it("refuses to pay when PayPal is not linked", () => {
    const result = evaluateSpend(base({ vaultReady: false }));
    expect(result.decision).toBe("deny");
    expect(result.explanation).toContain("Link PayPal");
  });

  it("asks for a clearer sentence when the intent is incomplete", () => {
    const result = evaluateSpend(base({ intentComplete: false, amountCents: null, merchantName: null }));
    expect(result.decision).toBe("needs_clarification");
  });

  it("still enforces the allowance after a human approves", () => {
    const result = evaluateSpend(base({ amountCents: 7500, allowanceRemainingCents: 1000, humanApproved: true }));
    expect(result.decision).toBe("deny");
    expect(result.reasons.map((reason) => reason.code)).toContain("allowance");
  });
});
