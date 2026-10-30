import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST as spend } from "@/app/api/agents/[id]/spend/route";
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
  expect(body.order.payment_source.paypal.vault_id).toBe("VAULT-MOCK-MAYA");
  expect(body.order.purchase_units[0].custom_id).toBe(body.intent.id);
});
