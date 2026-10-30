import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { getAgent, getPaypalOrderByCustomId, netSpentCents } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";
import { createMockPayPal } from "@/src/paypal/mock";
import { approveIntent, panicFreeze, pauseAgent, refundIntent, requestPurchase, revokeVault } from "@/src/server/actions";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const ENV = { PAYPAL_MODE: "mock", AI_MODE: "mock" };

describe("demo spend flow", () => {
  it("charges the merchant from the vault and never parks a balance", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    const paypal = createMockPayPal(sql, { now: () => NOW });
    const options = { now: NOW, env: ENV, paypal };

    const oats = await requestPurchase(sql, "agent_grocer", "Buy oat milk and eggs from Green Grocer for $18.40", options);
    expect(oats.body.ok).toBe(true);
    if (!oats.body.ok) return;
    expect(oats.body.intent.status).toBe("captured");
    expect(oats.body.order?.payment_source?.paypal?.vault_id).toBe("VAULT-MOCK-MAYA");
    expect(oats.body.order?.purchase_units[0]?.custom_id).toBe(oats.body.intent.id);
    expect(oats.body.order?.purchase_units[0]?.payee?.email_address).toContain("@");
    expect(await netSpentCents(sql, "agent_grocer")).toBe(1840);
    const stored = await getPaypalOrderByCustomId(sql, oats.body.intent.id);
    expect(stored?.vaultId).toBe("VAULT-MOCK-MAYA");

    const flight = await requestPurchase(sql, "agent_wayfinder", "Book a $900 flight to Lisbon on SkyAir", options);
    expect(flight.body.ok).toBe(true);
    if (!flight.body.ok) return;
    expect(flight.body.intent.status).toBe("denied");
    expect(flight.body.order).toBeNull();
    expect(flight.body.explanation).toContain("per-payment cap");

    const hold = await requestPurchase(sql, "agent_wayfinder", "Hold a $75 seat from Metro Rail", options);
    expect(hold.body.ok).toBe(true);
    if (!hold.body.ok) return;
    expect(hold.body.intent.status).toBe("pending_approval");
    const approved = await approveIntent(sql, hold.body.intent.id, "Go ahead", options);
    expect(approved.body.ok).toBe(true);
    if (!approved.body.ok) return;
    expect(approved.body.intent.status).toBe("captured");

    const charger = await requestPurchase(sql, "agent_grocer", "Buy a $40 charger from Unknown Gadgets", options);
    expect(charger.body.ok).toBe(true);
    if (!charger.body.ok) return;
    expect(charger.body.intent.status).toBe("denied");

    const refund = await refundIntent(sql, oats.body.intent.id, options);
    expect(refund.body.ok).toBe(true);
    expect(await netSpentCents(sql, "agent_grocer")).toBe(0);

    await pauseAgent(sql, "agent_handy", true);
    const paused = await requestPurchase(sql, "agent_handy", "Buy a $10 cable from Unknown Gadgets", options);
    expect(paused.body.ok).toBe(true);
    if (!paused.body.ok) return;
    expect(paused.body.explanation).toContain("paused");

    await panicFreeze(sql, "purse_maya", true);
    const frozen = await requestPurchase(sql, "agent_stack", "Pay CloudApps $9 for extra storage", options);
    expect(frozen.body.ok).toBe(true);
    if (!frozen.body.ok) return;
    expect(frozen.body.explanation).toContain("panic");
    await panicFreeze(sql, "purse_maya", false);

    await revokeVault(sql, "purse_maya", options);
    const afterRevoke = await requestPurchase(sql, "agent_grocer", "Buy oat milk from Green Grocer for $4", options);
    expect(afterRevoke.body.ok).toBe(true);
    if (!afterRevoke.body.ok) return;
    expect(afterRevoke.body.explanation).toContain("Link PayPal");
    expect(await getAgent(sql, "agent_grocer")).toBeTruthy();
    await sql.close();
  });
});
