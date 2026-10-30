import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import {
  countPurses,
  envelopeSpentCents,
  getPurse,
  getSpend,
  insertPurse,
  listAgents,
  listEnvelopes,
} from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";

const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("seed and repository", () => {
  it("loads Maya's purse and stays idempotent", () => {
    const db = openDatabase(":memory:");
    const first = seedDemo(db, { now: NOW });
    insertPurse(db, {
      id: "purse_other",
      name: "Other",
      ownerName: "Sam",
      currency: "USD",
      balanceCents: 100,
      perTxnCapCents: 100,
      dailyCapCents: 100,
      approvalThresholdCents: 100,
      createdAt: NOW.toISOString(),
    });
    const second = seedDemo(db, { now: NOW });

    expect(first).toEqual(second);
    expect(countPurses(db)).toBe(2);
    const maya = getPurse(db, "purse_maya");
    expect(maya?.balanceCents).toBe(23800);
    expect(maya?.ownerName).toBe("Maya Chen");
    expect(listEnvelopes(db, "purse_maya")).toHaveLength(4);
    expect(listAgents(db, "purse_maya")).toHaveLength(4);

    const flight = getSpend(db, "spend_skyair");
    expect(flight?.status).toBe("denied");
    expect(flight?.merchantName).toBe("SkyAir");
    expect(flight?.amountCents).toBe(90000);
    expect(flight?.explanation).toContain("per-payment cap");

    expect(envelopeSpentCents(db, "env_software", "monthly", NOW)).toBe(1200);
    expect(envelopeSpentCents(db, "env_travel", "monthly", NOW)).toBe(0);
    db.close();
  });
});
