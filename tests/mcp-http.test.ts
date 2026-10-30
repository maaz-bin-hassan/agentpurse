import fs from "node:fs";
import { afterAll, expect, it } from "vitest";
import { POST } from "@/app/mcp/route";
import { closeDb, getDb } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";

const file = `/tmp/agentpurse-mcp-http-${process.pid}.db`;

afterAll(async () => {
  await closeDb();
  fs.rmSync(file, { force: true });
});

it("rejects an anonymous MCP call and lists tools for Grocer's key", async () => {
  process.env.AGENTPURSE_DB = file;
  process.env.AGENTPURSE_AUTO_SEED = "0";
  process.env.PAYPAL_MODE = "mock";
  delete process.env.DATABASE_URL;
  await closeDb();
  await seedDemo(await getDb());

  const denied = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  expect(denied.status).toBe(401);

  const allowed = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer agpk_grocer_demo_maya",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  expect(allowed.status).toBe(200);
  const body = await allowed.json();
  expect(body.result.tools).toHaveLength(5);
});
