import type { DatabaseSync } from "node:sqlite";
import { centsToDecimal } from "@/src/domain/money";
import type { PaypalOrderRecord } from "@/src/domain/types";
import {
  insertAgent,
  insertAudit,
  insertEnvelope,
  insertPurse,
  insertSpend,
  upsertMerchant,
  upsertPaypalOrder,
} from "@/src/db/repository";
import { transaction } from "@/src/db/transaction";

export const DEMO_PURSE_ID = "purse_maya";

function iso(date: Date): string {
  return date.toISOString();
}

function daysBefore(now: Date, days: number, hours = 0): string {
  const copy = new Date(now.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  copy.setUTCHours(hours, 0, 0, 0);
  return copy.toISOString();
}

function completedOrder(input: {
  id: string;
  captureId: string;
  purseId: string;
  spendRequestId: string | null;
  kind: "topup" | "spend";
  amountCents: number;
  createdAt: string;
}): PaypalOrderRecord {
  const value = centsToDecimal(input.amountCents);
  const body = {
    id: input.id,
    status: "COMPLETED",
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: input.spendRequestId ?? input.purseId,
        amount: { currency_code: "USD", value },
        payments: {
          captures: [
            {
              id: input.captureId,
              status: "COMPLETED",
              amount: { currency_code: "USD", value },
            },
          ],
        },
      },
    ],
    links: [],
    create_time: input.createdAt,
    update_time: input.createdAt,
  };
  return {
    id: input.id,
    purseId: input.purseId,
    spendRequestId: input.spendRequestId,
    kind: input.kind,
    status: "COMPLETED",
    currency: "USD",
    amountCents: input.amountCents,
    captureId: input.captureId,
    customId: input.spendRequestId ?? input.purseId,
    rawJson: JSON.stringify(body),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function seedDemo(db: DatabaseSync, options?: { now?: Date }): { purseId: string; balanceCents: number } {
  const now = options?.now ?? new Date();
  const createdAt = daysBefore(now, 3, 12);
  const topupAt = daysBefore(now, 2, 15);
  const softwareAt = daysBefore(now, 1, 16);
  const flightAt = daysBefore(now, 1, 18);
  const balanceCents = 23800;

  transaction(db, () => {
    db.prepare("DELETE FROM purses WHERE id = ?").run(DEMO_PURSE_ID);

    insertPurse(db, {
      id: DEMO_PURSE_ID,
      name: "Maya's Household",
      ownerName: "Maya Chen",
      currency: "USD",
      balanceCents,
      perTxnCapCents: 15000,
      dailyCapCents: 30000,
      approvalThresholdCents: 5000,
      createdAt,
    });

    const envelopes = [
      ["env_groceries", "Groceries", "groceries", 8000, "weekly"],
      ["env_travel", "Travel", "travel", 40000, "monthly"],
      ["env_software", "Software", "software", 4000, "monthly"],
      ["env_household", "Household", "electronics", 10000, "monthly"],
    ] as const;
    for (const [id, name, category, limitCents, period] of envelopes) {
      insertEnvelope(db, {
        id,
        purseId: DEMO_PURSE_ID,
        name,
        category,
        limitCents,
        period,
        createdAt,
      });
    }

    insertAgent(db, {
      id: "agent_grocer",
      purseId: DEMO_PURSE_ID,
      name: "Grocer",
      description: "Buys food for the house.",
      allowedCategories: ["groceries"],
      status: "active",
      createdAt,
    });
    insertAgent(db, {
      id: "agent_wayfinder",
      purseId: DEMO_PURSE_ID,
      name: "Wayfinder",
      description: "Books trains, flights, and hotels.",
      allowedCategories: ["travel"],
      status: "active",
      createdAt,
    });
    insertAgent(db, {
      id: "agent_stack",
      purseId: DEMO_PURSE_ID,
      name: "Stack",
      description: "Pays for software the household uses.",
      allowedCategories: ["software"],
      status: "active",
      createdAt,
    });
    insertAgent(db, {
      id: "agent_handy",
      purseId: DEMO_PURSE_ID,
      name: "Handy",
      description: "Replaces cables, chargers, and small gear.",
      allowedCategories: ["electronics"],
      status: "active",
      createdAt,
    });

    const merchants = [
      ["merch_green_grocer", "Green Grocer", "groceries", true, false],
      ["merch_metro_rail", "Metro Rail", "travel", true, false],
      ["merch_cloudapps", "CloudApps", "software", true, false],
      ["merch_skyair", "SkyAir", "travel", true, false],
      ["merch_unknown_gadgets", "Unknown Gadgets", "electronics", false, false],
      ["merch_lucky_chips", "Lucky Chips", "electronics", false, true],
    ] as const;
    for (const [id, name, category, trusted, blocked] of merchants) {
      upsertMerchant(db, { id, name, category, trusted, blocked });
    }

    upsertPaypalOrder(
      db,
      completedOrder({
        id: "PAY-MOCK-TOPUP2500",
        captureId: "CAP-MOCK-TOPUP2500",
        purseId: DEMO_PURSE_ID,
        spendRequestId: null,
        kind: "topup",
        amountCents: 25000,
        createdAt: topupAt,
      }),
    );
    insertAudit(db, {
      id: "audit_topup",
      purseId: DEMO_PURSE_ID,
      actor: "paypal",
      action: "topup_captured",
      detail: "Captured PayPal order PAY-MOCK-TOPUP2500 for $250.00. Purse balance funded.",
      createdAt: topupAt,
    });

    upsertPaypalOrder(
      db,
      completedOrder({
        id: "PAY-MOCK-CLOUD012",
        captureId: "CAP-MOCK-CLOUD012",
        purseId: DEMO_PURSE_ID,
        spendRequestId: "spend_cloudapps",
        kind: "spend",
        amountCents: 1200,
        createdAt: softwareAt,
      }),
    );
    insertSpend(db, {
      id: "spend_cloudapps",
      purseId: DEMO_PURSE_ID,
      agentId: "agent_stack",
      envelopeId: "env_software",
      rawText: "Pay CloudApps $12 for the monthly team plan",
      merchantName: "CloudApps",
      amountCents: 1200,
      currency: "USD",
      category: "software",
      purpose: "Pay CloudApps $12 for the monthly team plan",
      confidence: 0.95,
      decision: "allow",
      decisionReasons: [],
      explanation: "Paid CloudApps $12.00 from the Software envelope.",
      status: "captured",
      paypalOrderId: "PAY-MOCK-CLOUD012",
      captureId: "CAP-MOCK-CLOUD012",
      createdAt: softwareAt,
      updatedAt: softwareAt,
    });
    insertAudit(db, {
      id: "audit_cloudapps",
      purseId: DEMO_PURSE_ID,
      actor: "stack",
      action: "spend_captured",
      detail: "Paid CloudApps $12.00 from the Software envelope.",
      createdAt: softwareAt,
    });

    const flightReasons = [
      { code: "per_txn_cap", sentence: "$900.00 is over the $150.00 per-payment cap." },
      { code: "envelope_cap", sentence: "The Travel envelope has $400.00 left this month." },
      { code: "daily_cap", sentence: "$900.00 would exceed the $300.00 daily cap." },
    ];
    const flightExplanation = `Denied. ${flightReasons.map((reason) => reason.sentence).join(" ")}`;
    insertSpend(db, {
      id: "spend_skyair",
      purseId: DEMO_PURSE_ID,
      agentId: "agent_wayfinder",
      envelopeId: "env_travel",
      rawText: "Book a $900 flight to Lisbon on SkyAir",
      merchantName: "SkyAir",
      amountCents: 90000,
      currency: "USD",
      category: "travel",
      purpose: "Book a $900 flight to Lisbon on SkyAir",
      confidence: 0.95,
      decision: "deny",
      decisionReasons: flightReasons,
      explanation: flightExplanation,
      status: "denied",
      paypalOrderId: null,
      captureId: null,
      createdAt: flightAt,
      updatedAt: flightAt,
    });
    insertAudit(db, {
      id: "audit_skyair",
      purseId: DEMO_PURSE_ID,
      actor: "clerk",
      action: "spend_denied",
      detail: flightExplanation,
      createdAt: flightAt,
    });
  });

  return { purseId: DEMO_PURSE_ID, balanceCents };
}

export function demoClock(now = new Date()): string {
  return iso(now);
}
