import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";
import { loadHousehold } from "@/src/server/view";

describe("household view", () => {
  it("shows four allowances, a vaulted wallet, and the denied flight", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: new Date("2026-10-30T12:00:00.000Z") });
    const view = await loadHousehold(sql, "purse_maya");
    expect(view?.agents).toHaveLength(4);
    expect(view?.vault?.status).toBe("vaulted");
    expect(view?.agents.find((agent) => agent.name === "Stack")?.spentCents).toBe(1200);
    expect(view?.agents.find((agent) => agent.name === "Stack")?.remainingCents).toBe(2800);
    expect(view?.intents.some((intent) => intent.explanation?.includes("per-payment cap"))).toBe(true);
    expect(view?.receipts.some((receipt) => receipt.merchantName === "CloudApps")).toBe(true);
    await sql.close();
  });
});
