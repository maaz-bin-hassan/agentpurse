import fs from "node:fs";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { POST } from "@/app/api/demo/reset/route";
import { closeDb, getDb } from "@/src/db/connection";
import { migrationsDir, splitSql } from "@/src/db/migrations";
import { getAgentByApiKey, getIntent, hashApiKey, netSpentCents } from "@/src/db/repository";
import { DEMO_KEYS } from "@/src/domain/demo-keys";
import { requestPurchase } from "@/src/server/actions";
import { demoCookieHeader } from "@/src/server/auth";

const file = `/tmp/agentpurse-reset-${process.pid}.db`;

afterAll(async () => {
  await closeDb();
  fs.rmSync(file, { force: true });
});

it("restores Maaz after a purchase when the demo session is present", async () => {
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

it("moves kept demo agents from the old _maya keys to the _maaz keys", async () => {
  const sql = await getDb();
  const stale = async () => {
    for (const [id, key] of Object.entries(DEMO_KEYS)) {
      await sql.exec("UPDATE agents SET api_key_hash = ? WHERE id = ?", [hashApiKey(key.replace("_maaz", "_maya")), id]);
    }
    expect(await getAgentByApiKey(sql, DEMO_KEYS.agent_grocer)).toBeUndefined();
  };

  await stale();
  for (const statement of splitSql(fs.readFileSync(path.join(migrationsDir(), "0006_rename_demo_keys.sql"), "utf8"))) {
    await sql.exec(statement);
  }
  for (const [id, key] of Object.entries(DEMO_KEYS)) expect((await getAgentByApiKey(sql, key))?.id).toBe(id);

  await stale();
  const response = await POST(
    new Request("http://localhost/api/demo/reset", { method: "POST", headers: { cookie: await demoCookieHeader() } }),
  );
  expect(response.status).toBe(200);
  for (const [id, key] of Object.entries(DEMO_KEYS)) expect((await getAgentByApiKey(sql, key))?.id).toBe(id);
});
