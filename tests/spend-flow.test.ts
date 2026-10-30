import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { envelopeSpentCents, getPurse, listPaypalOrders } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";
import { createMockPayPal } from "@/src/paypal/mock";
import { approveSpend, createTopup, approvePaypalOrder, captureTopup, refundSpend, submitSpend } from "@/src/server/actions";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const ENV = { PAYPAL_MODE: "mock", AI_MODE: "mock" };

describe("demo spend flow", () => {
  it("allows, denies, holds, approves, and refunds without credentials", async () => {
    const db = openDatabase(":memory:");
    seedDemo(db, { now: NOW });
    const paypal = createMockPayPal(db, { now: () => NOW });
    const options = { now: NOW, env: ENV, paypal };

    const oats = await submitSpend(db, "agent_grocer", "Buy oat milk and eggs from Green Grocer for $18.40", options);
    expect(oats.status).toBe(200);
    expect(oats.body.ok).toBe(true);
    if (!oats.body.ok) return;
    expect(oats.body.spend.status).toBe("captured");
    expect(oats.body.explanation).toContain("Green Grocer");
    expect(oats.body.order?.status).toBe("COMPLETED");
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 1840);

    const flight = await submitSpend(db, "agent_wayfinder", "Book a $900 flight to Lisbon on SkyAir", options);
    expect(flight.body.ok).toBe(true);
    if (!flight.body.ok) return;
    expect(flight.body.spend.status).toBe("denied");
    expect(flight.body.order).toBeNull();
    expect(flight.body.explanation).toContain("per-payment cap");
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 1840);

    const rail = await submitSpend(db, "agent_wayfinder", "Buy Metro Rail tickets for $42", options);
    expect(rail.body.ok).toBe(true);
    if (!rail.body.ok) return;
    expect(rail.body.spend.status).toBe("captured");
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 1840 - 4200);

    const hold = await submitSpend(db, "agent_wayfinder", "Hold a $75 seat from Metro Rail", options);
    expect(hold.body.ok).toBe(true);
    if (!hold.body.ok) return;
    expect(hold.body.spend.status).toBe("pending_approval");
    expect(hold.body.explanation).toContain("Held for Maya Chen");
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 1840 - 4200);

    const approved = await approveSpend(db, hold.body.spend.id, "Go ahead", options);
    expect(approved.status).toBe(200);
    expect(approved.body.ok).toBe(true);
    if (!approved.body.ok) return;
    expect(approved.body.spend.status).toBe("captured");
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 1840 - 4200 - 7500);

    const charger = await submitSpend(db, "agent_grocer", "Buy a $40 charger from Unknown Gadgets", options);
    expect(charger.body.ok).toBe(true);
    if (!charger.body.ok) return;
    expect(charger.body.spend.status).toBe("denied");
    expect(charger.body.explanation).toContain("cannot spend on electronics");

    const gadget = await submitSpend(db, "agent_handy", "Buy a $30 charger from Unknown Gadgets", options);
    expect(gadget.body.ok).toBe(true);
    if (!gadget.body.ok) return;
    expect(gadget.body.spend.status).toBe("pending_approval");
    expect(gadget.body.explanation).toContain("not a trusted merchant");

    const chips = await submitSpend(db, "agent_handy", "Buy $10 from Lucky Chips", options);
    expect(chips.body.ok).toBe(true);
    if (!chips.body.ok) return;
    expect(chips.body.spend.decision).toBe("deny");
    expect(chips.body.explanation).toContain("blocked");

    const vague = await submitSpend(db, "agent_grocer", "buy some milk", options);
    expect(vague.body.ok).toBe(true);
    if (!vague.body.ok) return;
    expect(vague.body.spend.status).toBe("needs_clarification");

    const refund = await refundSpend(db, oats.body.spend.id, options);
    expect(refund.body.ok).toBe(true);
    expect(getPurse(db, "purse_maya")?.balanceCents).toBe(23800 - 4200 - 7500);
    expect(envelopeSpentCents(db, "env_groceries", "weekly", NOW)).toBe(0);

    const drained = getPurse(db, "purse_maya");
    expect(drained).toBeTruthy();
    if (!drained) return;
    const { setBalance } = await import("@/src/db/repository");
    setBalance(db, "purse_maya", 100);
    const blocked = await approveSpend(db, gadget.body.spend.id, undefined, options);
    expect(blocked.status).toBe(409);
    expect(blocked.body.ok).toBe(false);

    setBalance(db, "purse_maya", drained.balanceCents);
    const topup = await createTopup(db, "purse_maya", 5000, options);
    expect(topup.body.ok).toBe(true);
    if (!topup.body.ok) return;
    expect(topup.body.order.status).toBe("CREATED");
    const approvedOrder = await approvePaypalOrder(db, topup.body.order.id, options);
    expect(approvedOrder.body.ok).toBe(true);
    const captured = await captureTopup(db, topup.body.order.id, options);
    expect(captured.body.ok).toBe(true);
    if (!captured.body.ok) return;
    expect(captured.body.balanceCents).toBe(drained.balanceCents + 5000);

    const orders = listPaypalOrders(db, "purse_maya");
    expect(orders.length).toBeGreaterThanOrEqual(6);
    db.close();
  });
});
