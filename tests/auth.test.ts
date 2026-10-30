import { describe, expect, it } from "vitest";
import { POST as panic } from "@/app/api/households/[id]/panic/route";
import { POST as spend } from "@/app/api/agents/[id]/spend/route";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import { demoCookieHeader, rateLimit, resetRateLimits } from "@/src/server/auth";

describe("route auth", () => {
  it("signs a demo session that round-trips and blocks agent keys from panic", async () => {
    const { closeDb, getDb } = await import("@/src/db/connection");
    process.env.AGENTPURSE_DB = `/tmp/agentpurse-auth-${process.pid}.db`;
    process.env.AGENTPURSE_AUTO_SEED = "0";
    process.env.PAYPAL_MODE = "mock";
    delete process.env.DATABASE_URL;
    await closeDb();
    await seedDemo(await getDb());

    const header = await demoCookieHeader();
    expect(header.startsWith("ap_demo=")).toBe(true);

    const blocked = await panic(
      new Request("http://localhost/api/households/purse_maya/panic", {
        method: "POST",
        headers: { authorization: `Bearer ${DEMO_KEYS.agent_grocer}`, "content-type": "application/json" },
        body: JSON.stringify({ frozen: true }),
      }),
      { params: Promise.resolve({ id: "purse_maya" }) },
    );
    expect(blocked.status).toBe(403);

    const missing = await spend(
      new Request("http://localhost/api/agents/agent_grocer/spend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(2001) }),
      }),
      { params: Promise.resolve({ id: "agent_grocer" }) },
    );
    expect(missing.status).toBe(401);
  });

  it("rate limits a noisy client", () => {
    resetRateLimits();
    const request = new Request("http://localhost/api/health", { headers: { "x-forwarded-for": "203.0.113.8" } });
    for (let i = 0; i < 120; i += 1) expect(rateLimit(request)).toBeNull();
    expect(rateLimit(request)?.status).toBe(429);
    resetRateLimits();
  });
});
