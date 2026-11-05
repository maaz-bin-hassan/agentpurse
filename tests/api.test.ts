import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST as spend } from "@/app/api/agents/[id]/spend/route";
import { GET as spendStatus } from "@/app/api/spends/[id]/route";
import { closeDb, getDb } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";
import { demoCookieHeader } from "@/src/server/auth";

const file = path.join(os.tmpdir(), `agentpurse-api-${process.pid}.db`);

beforeAll(async () => {
  process.env.AGENTPURSE_DB = file;
  process.env.AGENTPURSE_AUTO_SEED = "0";
  process.env.PAYPAL_MODE = "mock";
  process.env.AI_MODE = "mock";
  delete process.env.DATABASE_URL;
  await closeDb();
  fs.rmSync(file, { force: true });
  await seedDemo(await getDb(), { now: new Date("2026-10-30T12:00:00.000Z") });
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
});

it("rejects an anonymous spend and captures one with the demo session", async () => {
  const anonymous = await spend(
    new Request("http://localhost/api/agents/agent_grocer/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Buy oat milk from Green Grocer for $4" }),
    }),
    { params: Promise.resolve({ id: "agent_grocer" }) },
  );
  expect(anonymous.status).toBe(401);

  const response = await spend(
    new Request("http://localhost/api/agents/agent_grocer/spend", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await demoCookieHeader() },
      body: JSON.stringify({ text: "Buy oat milk and eggs from Green Grocer for $18.40" }),
    }),
    { params: Promise.resolve({ id: "agent_grocer" }) },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.intent.status).toBe("captured");
  expect(body.order.payment_source.paypal.vault_id).toBe("VAULT-MOCK-MAAZ");
  expect(body.order.purchase_units[0].custom_id).toBe(body.intent.id);
});

it("lets the spending agent poll a held cheque and hides it from everyone else", async () => {
  const held = await spend(
    new Request("http://localhost/api/agents/agent_grocer/spend", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer agpk_grocer_demo_maaz",
      },
      body: JSON.stringify({ text: "Buy oat milk from Green Grocer for $50" }),
    }),
    { params: Promise.resolve({ id: "agent_grocer" }) },
  );
  expect(held.status).toBe(200);
  const created = await held.json();
  expect(created.intent.status).toBe("pending_approval");

  const anonymous = await spendStatus(new Request(`http://localhost/api/spends/${created.intent.id}`), {
    params: Promise.resolve({ id: created.intent.id }),
  });
  expect(anonymous.status).toBe(401);

  const otherAgent = await spendStatus(
    new Request(`http://localhost/api/spends/${created.intent.id}`, {
      headers: { authorization: "Bearer agpk_wayfinder_demo_maaz" },
    }),
    { params: Promise.resolve({ id: created.intent.id }) },
  );
  expect(otherAgent.status).toBe(404);

  const status = await spendStatus(
    new Request(`http://localhost/api/spends/${created.intent.id}`, {
      headers: { authorization: "Bearer agpk_grocer_demo_maaz" },
    }),
    { params: Promise.resolve({ id: created.intent.id }) },
  );
  expect(status.status).toBe(200);
  const body = await status.json();
  expect(body.ok).toBe(true);
  expect(body.intent).toMatchObject({
    id: created.intent.id,
    status: "pending_approval",
    merchantName: "Green Grocer",
    amountCents: 5000,
    guardDecision: "pass",
  });
  expect(body.intent.pageExcerpt).toBeUndefined();
  expect(body.approvalUrl).toContain("/purses/purse_maaz");
  expect(body.approvalUrl).toContain(`hold=${created.intent.id}`);

  const owner = await spendStatus(
    new Request(`http://localhost/api/spends/${created.intent.id}`, {
      headers: { cookie: await demoCookieHeader() },
    }),
    { params: Promise.resolve({ id: created.intent.id }) },
  );
  expect(owner.status).toBe(200);
});
