import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST as spend } from "@/app/api/agents/[id]/spend/route";
import { closeDb, getDb } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";

const file = path.join(os.tmpdir(), `agentpurse-api-${process.pid}.db`);

beforeAll(() => {
  process.env.AGENTPURSE_DB = file;
  process.env.AGENTPURSE_AUTO_SEED = "0";
  process.env.PAYPAL_MODE = "mock";
  process.env.AI_MODE = "mock";
  closeDb();
  fs.rmSync(file, { force: true });
  seedDemo(getDb(), { now: new Date("2026-10-30T12:00:00.000Z") });
});

afterAll(() => {
  closeDb();
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
});

it("captures a grocery sentence through the HTTP handler", async () => {
  const response = await spend(
    new Request("http://localhost/api/agents/agent_grocer/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Buy oat milk and eggs from Green Grocer for $18.40" }),
    }),
    { params: Promise.resolve({ id: "agent_grocer" }) },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.spend.status).toBe("captured");
  expect(body.order.status).toBe("COMPLETED");
  expect(body.explanation).toContain("Paid Green Grocer");
});
