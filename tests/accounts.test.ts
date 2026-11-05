import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAgent } from "@/app/api/agents/route";
import { POST as rotateKey } from "@/app/api/agents/[id]/key/route";
import { POST as pause } from "@/app/api/agents/[id]/pause/route";
import { POST as spend } from "@/app/api/agents/[id]/spend/route";
import { POST as panic } from "@/app/api/households/[id]/panic/route";
import { getAgent, getAgentByApiKey, ownerIdForAuthUser } from "@/src/db/repository";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import { demoCookieHeader, resetRateLimits } from "@/src/server/auth";
import { setSessionResolverForTests } from "@/src/server/session";

const USERS: Record<string, { id: string; email: string; name: string }> = {
  alice: { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.com", name: "Alice" },
  bob: { id: "22222222-2222-4222-8222-222222222222", email: "bob@example.com", name: "Bob" },
};

const session = (user: string) => `sb-test-auth-token=${user}`;

function post(url: string, cookie: string | null, body: unknown = {}, bearer?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request(`http://localhost${url}`, { method: "POST", headers, body: JSON.stringify(body) });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("accounts", () => {
  beforeAll(async () => {
    const { closeDb, getDb } = await import("@/src/db/connection");
    process.env.AGENTPURSE_DB = `/tmp/agentpurse-accounts-${process.pid}.db`;
    process.env.AGENTPURSE_AUTO_SEED = "0";
    process.env.PAYPAL_MODE = "mock";
    delete process.env.DATABASE_URL;
    await closeDb();
    const sql = await getDb();
    await sql.exec("DELETE FROM agents WHERE owner_id IN (SELECT id FROM owners WHERE auth_user_id IS NOT NULL)");
    await sql.exec("DELETE FROM audit_events WHERE owner_id IN (SELECT id FROM owners WHERE auth_user_id IS NOT NULL)");
    await sql.exec("DELETE FROM owners WHERE auth_user_id IS NOT NULL");
    await seedDemo(sql);
    resetRateLimits();
    setSessionResolverForTests(async (cookies) => {
      const name = cookies.find((cookie) => cookie.name === "sb-test-auth-token")?.value;
      return name && USERS[name] ? USERS[name] : null;
    });
  });

  afterAll(() => setSessionResolverForTests(null));

  it("creates one owner per account and an agent whose key works only for that agent", async () => {
    const response = await createAgent(post("/api/agents", session("alice"), { templateId: "grocery-runner", edits: { name: "Pantry" } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { agent: { id: string }; apiKey: string };
    const { getDb } = await import("@/src/db/connection");
    const sql = await getDb();
    const ownerId = await ownerIdForAuthUser(sql, USERS.alice.id);
    expect(ownerId).toBeTruthy();
    const agent = await getAgentByApiKey(sql, body.apiKey);
    expect(agent?.id).toBe(body.agent.id);
    expect(agent?.ownerId).toBe(ownerId);

    const again = await createAgent(post("/api/agents", session("alice"), { templateId: "saas-manager" }));
    expect(again.status).toBe(200);
    expect(await ownerIdForAuthUser(sql, USERS.alice.id)).toBe(ownerId);

    const ownSpend = await spend(post(`/api/agents/${body.agent.id}/spend`, null, { text: "Buy oat milk from Green Grocer for $12" }, body.apiKey), params(body.agent.id));
    expect([401, 403]).not.toContain(ownSpend.status);
    const otherSpend = await spend(post("/api/agents/agent_grocer/spend", null, { text: "Buy milk for $5" }, body.apiKey), params("agent_grocer"));
    expect(otherSpend.status).toBe(403);
  });

  it("keeps one account out of another account and out of the demo purse", async () => {
    const created = await createAgent(post("/api/agents", session("alice"), { templateId: "travel-booker" }));
    const { agent, apiKey } = (await created.json()) as { agent: { id: string }; apiKey: string };
    const { getDb } = await import("@/src/db/connection");
    const aliceOwner = (await ownerIdForAuthUser(await getDb(), USERS.alice.id))!;

    expect((await pause(post(`/api/agents/${agent.id}/pause`, session("bob"), { paused: true }), params(agent.id))).status).toBe(403);
    expect((await rotateKey(post(`/api/agents/${agent.id}/key`, session("bob")), params(agent.id))).status).toBe(404);
    expect((await panic(post(`/api/households/${aliceOwner}/panic`, session("bob"), { frozen: true }), params(aliceOwner))).status).toBe(403);
    expect((await panic(post("/api/households/purse_maaz/panic", session("bob"), { frozen: true }), params("purse_maaz"))).status).toBe(403);
    expect((await rotateKey(post("/api/agents/agent_grocer/key", session("alice")), params("agent_grocer"))).status).toBe(404);

    const rotated = await rotateKey(post(`/api/agents/${agent.id}/key`, session("alice")), params(agent.id));
    expect(rotated.status).toBe(200);
    const fresh = ((await rotated.json()) as { apiKey: string }).apiKey;
    const sql = await getDb();
    expect(await getAgentByApiKey(sql, apiKey)).toBeUndefined();
    expect((await getAgentByApiKey(sql, fresh))?.id).toBe(agent.id);
    expect((await getAgent(sql, agent.id))?.status).toBe("active");
  });

  it("refuses agent creation without an account, and keeps the judges' demo session working", async () => {
    const demo = await demoCookieHeader();
    expect((await createAgent(post("/api/agents", demo, { templateId: "grocery-runner" }))).status).toBe(401);
    expect((await createAgent(post("/api/agents", null, { templateId: "grocery-runner" }, DEMO_KEYS.agent_grocer))).status).toBe(403);
    expect((await createAgent(post("/api/agents", session("bob"), { templateId: "nope" }))).status).toBe(400);

    const both = `${demo}; ${session("alice")}`;
    const frozen = await panic(post("/api/households/purse_maaz/panic", both, { frozen: true }), params("purse_maaz"));
    expect(frozen.status).toBe(200);
    const cleared = await panic(post("/api/households/purse_maaz/panic", demo, { frozen: false }), params("purse_maaz"));
    expect(cleared.status).toBe(200);
  });
});
