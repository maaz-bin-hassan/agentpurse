import fs from "node:fs";
import { afterAll, expect, it } from "vitest";
import { POST } from "@/app/api/demo/reset/route";
import { closeDb, getDb } from "@/src/db/connection";
import { getIntent, netSpentCents } from "@/src/db/repository";
import { requestPurchase } from "@/src/server/actions";
import { demoCookieHeader } from "@/src/server/auth";

const file = `/tmp/agentpurse-reset-${process.pid}.db`;

afterAll(async () => {
  await closeDb();
  fs.rmSync(file, { force: true });
});

it("restores Maya after a purchase when the demo session is present", async () => {
  process.env.AGENTPURSE_DB = file;
  process.env.AGENTPURSE_AUTO_SEED = "1";
  process.env.PAYPAL_MODE = "mock";
  delete process.env.DATABASE_URL;
  await closeDb();
  const sql = await getDb();
  const bought = await requestPurchase(sql, "agent_grocer", "Buy oat milk from Green Grocer for $4");
  expect(bought.body.ok).toBe(true);
  expect(await netSpentCents(sql, "agent_grocer")).toBeGreaterThan(0);

  const anonymous = await POST(new Request("http://localhost/api/demo/reset", { method: "POST" }));
  expect(anonymous.status).toBe(401);

  const response = await POST(
    new Request("http://localhost/api/demo/reset", { method: "POST", headers: { cookie: await demoCookieHeader() } }),
  );
  expect(response.status).toBe(200);
  expect(await netSpentCents(await getDb(), "agent_grocer")).toBe(0);
  expect((await getIntent(await getDb(), "intent_skyair"))?.status).toBe("denied");
});
