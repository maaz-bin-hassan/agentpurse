import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { openPglite } from "@/src/db/sql";
import { migrate } from "@/src/db/schema";
import { getIntent, getOwner, listAgents, netSpentCents } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";

const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("seed and repository", () => {
  it("loads Maya once on SQLite and keeps allowances as a ledger", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    await seedDemo(sql, { now: NOW });
    const owner = await getOwner(sql, "purse_maya");
    expect(owner?.name).toBe("Maya Chen");
    expect(await listAgents(sql, "purse_maya")).toHaveLength(4);
    const flight = await getIntent(sql, "intent_skyair");
    expect(flight?.status).toBe("denied");
    expect(flight?.paypalOrderId).toBeNull();
    expect(flight?.explanation).toContain("allowance");
    expect(await netSpentCents(sql, "agent_stack")).toBe(1200);
    await sql.close();
  });

  it("applies the same schema on Postgres", async () => {
    const sql = await openPglite();
    await migrate(sql);
    await seedDemo(sql, { now: NOW });
    const flight = await getIntent(sql, "intent_skyair");
    expect(flight?.merchantName).toBe("SkyAir");
    expect(await netSpentCents(sql, "agent_grocer")).toBe(0);
    await sql.close();
  });
});
