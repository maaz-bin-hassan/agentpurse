import { DEMO_KEYS } from "@/src/domain/demo-keys";
import { DEMO_PAYEE } from "@/src/domain/payee";
import { evaluateSpend } from "@/src/policy/engine";
import {
  insertAgent,
  insertAudit,
  insertIntent,
  insertOwner,
  insertReceipt,
  newId,
  saveVault,
  upsertMerchant,
  upsertPaypalOrder,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";

export const DEMO_OWNER_ID = "purse_maya";

export { DEMO_KEYS };

export const DEMO_VAULT_ID = "VAULT-MOCK-MAYA";

function daysBefore(now: Date, days: number, hours = 0): string {
  const copy = new Date(now.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  copy.setUTCHours(hours, 0, 0, 0);
  return copy.toISOString();
}

export async function seedDemo(sql: Sql, options?: { now?: Date }): Promise<{ ownerId: string }> {
  const now = options?.now ?? new Date();
  const createdAt = daysBefore(now, 3, 12);
  const softwareAt = daysBefore(now, 1, 16);
  const flightAt = daysBefore(now, 1, 18);

  await sql.transaction(async (tx) => {
    await tx.exec("DELETE FROM approvals WHERE intent_id IN (SELECT id FROM intents WHERE owner_id = ?)", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM receipts WHERE owner_id = ?", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM paypal_orders WHERE owner_id = ?", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM quotes WHERE agent_id IN (SELECT id FROM agents WHERE owner_id = ?)", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM intents WHERE owner_id = ?", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM audit_events WHERE owner_id = ?", [DEMO_OWNER_ID]);
    await tx.exec("DELETE FROM mock_payment_tokens WHERE id = ?", [DEMO_VAULT_ID]);
    await tx.exec("DELETE FROM owners WHERE id = ?", [DEMO_OWNER_ID]);
    await insertOwner(tx, {
      id: DEMO_OWNER_ID,
      name: "Maya Chen",
      email: "maya@example.com",
      panicFrozen: false,
      createdAt,
    });
    await saveVault(tx, {
      id: "vault_maya",
      ownerId: DEMO_OWNER_ID,
      setupTokenId: "SETUP-MOCK-MAYA",
      paymentTokenId: DEMO_VAULT_ID,
      paypalCustomerId: "CUSTOMER-MOCK-MAYA",
      payerEmail: "maya@example.com",
      status: "vaulted",
      createdAt,
      updatedAt: createdAt,
    });
    await tx.exec(
      `INSERT INTO mock_payment_tokens (id, setup_token_id, customer_id, payer_email, status, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', '{}', ?, ?)`,
      [DEMO_VAULT_ID, "SETUP-MOCK-MAYA", "CUSTOMER-MOCK-MAYA", "maya@example.com", createdAt, createdAt],
    );

    const agents = [
      ["agent_grocer", "Grocer", "claude", "Buys food for the house.", DEMO_KEYS.agent_grocer, 8000, "groceries"],
      ["agent_wayfinder", "Wayfinder", "grok", "Books trains, flights, and hotels.", DEMO_KEYS.agent_wayfinder, 40000, "travel"],
      ["agent_stack", "Stack", "chatgpt", "Pays for software the household uses.", DEMO_KEYS.agent_stack, 4000, "software"],
      ["agent_handy", "Handy", "mcp", "Replaces cables, chargers, and small gear.", DEMO_KEYS.agent_handy, 10000, "electronics"],
    ] as const;
    for (const [id, name, provider, description, apiKey, allowance, category] of agents) {
      await insertAgent(
        tx,
        {
          id,
          ownerId: DEMO_OWNER_ID,
          name,
          provider,
          description,
          apiKeyPrefix: apiKey.slice(0, 12),
          allowanceCents: allowance,
          status: "active",
          allowedCategories: [category],
          perTxnCapCents: 15000,
          dailyCapCents: 30000,
          approvalThresholdCents: 5000,
          trustedMerchantsOnly: false,
          policyText: `${name} may spend the ${category} allowance. Ask Maya at $50 or for an untrusted merchant.`,
          policySource: "seed",
          createdAt,
        },
        apiKey,
      );
    }

    const merchants = [
      ["merch_green_grocer", "Green Grocer", "groceries", true, false],
      ["merch_metro_rail", "Metro Rail", "travel", true, false],
      ["merch_cloudapps", "CloudApps", "software", true, false],
      ["merch_skyair", "SkyAir", "travel", true, false],
      ["merch_unknown_gadgets", "Unknown Gadgets", "electronics", false, false],
      ["merch_lucky_chips", "Lucky Chips", "electronics", false, true],
    ] as const;
    for (const [id, name, category, trusted, blocked] of merchants) {
      await upsertMerchant(tx, { id, name, category, trusted, blocked, paypalEmail: DEMO_PAYEE });
    }

    await insertReceipt(tx, {
      id: "rcpt_cloudapps",
      intentId: "intent_cloudapps",
      agentId: "agent_stack",
      ownerId: DEMO_OWNER_ID,
      kind: "capture",
      amountCents: 1200,
      currency: "USD",
      merchantName: "CloudApps",
      paypalOrderId: "PAY-MOCK-CLOUD012",
      captureId: "CAP-MOCK-CLOUD012",
      refundId: null,
      customId: "intent_cloudapps",
      webhookEventId: null,
      detail: "Paid CloudApps $12.00 from Stack's allowance.",
      createdAt: softwareAt,
    });
    await insertIntent(tx, {
      id: "intent_cloudapps",
      agentId: "agent_stack",
      ownerId: DEMO_OWNER_ID,
      originalTask: "Pay CloudApps $12 for the monthly team plan",
      rawText: "Pay CloudApps $12 for the monthly team plan",
      pageExcerpt: null,
      merchantName: "CloudApps",
      merchantEmail: DEMO_PAYEE,
      amountCents: 1200,
      currency: "USD",
      category: "software",
      purpose: "Pay CloudApps $12 for the monthly team plan",
      confidence: 0.95,
      guardDecision: "pass",
      guardReasons: [],
      decision: "allow",
      decisionReasons: [],
      explanation: "Paid CloudApps $12.00 from Stack's allowance.",
      status: "captured",
      paypalOrderId: "PAY-MOCK-CLOUD012",
      captureId: "CAP-MOCK-CLOUD012",
      approvalMethod: "auto",
      quoteId: null,
      createdAt: softwareAt,
      updatedAt: softwareAt,
    });
    await upsertPaypalOrder(tx, {
      id: "PAY-MOCK-CLOUD012",
      ownerId: DEMO_OWNER_ID,
      intentId: "intent_cloudapps",
      kind: "charge",
      status: "COMPLETED",
      currency: "USD",
      amountCents: 1200,
      captureId: "CAP-MOCK-CLOUD012",
      vaultId: DEMO_VAULT_ID,
      payeeEmail: DEMO_PAYEE,
      customId: "intent_cloudapps",
      rawJson: JSON.stringify({ id: "PAY-MOCK-CLOUD012", status: "COMPLETED", custom_id: "intent_cloudapps" }),
      createdAt: softwareAt,
      updatedAt: softwareAt,
    });

    const flight = evaluateSpend({
      ownerName: "Maya Chen",
      agentName: "Wayfinder",
      agentStatus: "active",
      panicFrozen: false,
      vaultReady: true,
      intentComplete: true,
      amountCents: 90000,
      currency: "USD",
      purseCurrency: "USD",
      merchantName: "SkyAir",
      merchantBlocked: false,
      merchantTrusted: true,
      category: "travel",
      categoryAllowed: true,
      perTxnCapCents: 15000,
      dailyCapCents: 30000,
      dailySpentCents: 0,
      allowanceRemainingCents: 40000,
      approvalThresholdCents: 5000,
    });
    if (flight.decision !== "deny") throw new Error("Demo flight must be denied");
    await insertIntent(tx, {
      id: "intent_skyair",
      agentId: "agent_wayfinder",
      ownerId: DEMO_OWNER_ID,
      originalTask: "Book a $900 flight to Lisbon on SkyAir",
      rawText: "Book a $900 flight to Lisbon on SkyAir",
      pageExcerpt: null,
      merchantName: "SkyAir",
      merchantEmail: DEMO_PAYEE,
      amountCents: 90000,
      currency: "USD",
      category: "travel",
      purpose: "Book a $900 flight to Lisbon on SkyAir",
      confidence: 0.95,
      guardDecision: "pass",
      guardReasons: [],
      decision: flight.decision,
      decisionReasons: flight.reasons,
      explanation: flight.explanation,
      status: "denied",
      paypalOrderId: null,
      captureId: null,
      approvalMethod: null,
      quoteId: null,
      createdAt: flightAt,
      updatedAt: flightAt,
    });
    await insertAudit(tx, {
      id: "audit_skyair",
      ownerId: DEMO_OWNER_ID,
      actor: "clerk",
      action: "spend_denied",
      detail: flight.explanation,
      createdAt: flightAt,
    });
    void newId;
  });

  return { ownerId: DEMO_OWNER_ID };
}
