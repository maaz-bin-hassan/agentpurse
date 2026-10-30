import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";
import { loadPurseView } from "@/src/server/view";

const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("purse view", () => {
  it("opens Maya's book at $238 with four envelopes and the denied flight", () => {
    const db = openDatabase(":memory:");
    seedDemo(db, { now: NOW });
    const view = loadPurseView(db, "purse_maya", NOW);
    expect(view?.purse.balanceCents).toBe(23800);
    expect(view?.envelopes).toHaveLength(4);
    expect(view?.agents).toHaveLength(4);
    expect(view?.envelopes.find((envelope) => envelope.name === "Software")?.spentCents).toBe(1200);
    expect(view?.ledger.some((row) => row.detail.includes("per-payment cap"))).toBe(true);
    expect(view?.holds).toHaveLength(0);
    db.close();
  });
});
