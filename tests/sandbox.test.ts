import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { POST as reset } from "@/app/api/demo/reset/route";
import { POST as sign } from "@/app/api/spends/[id]/sign/route";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { healthPayload, sandboxDemo } from "@/src/config";
import { closeDb, getDb, openDatabase } from "@/src/db/connection";
import { getIntent, getPaypalOrder, getPaypalOrderByCustomId, getVault, listReceipts, saveVault } from "@/src/db/repository";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import type { Sql } from "@/src/db/sql";
import { actorFromBearer, callTool } from "@/src/mcp/protocol";
import { createLivePayPal } from "@/src/paypal/live";
import { finishVaultLink, requestPurchase } from "@/src/server/actions";
import { demoCookieHeader } from "@/src/server/auth";
import { handlePaypalWebhook } from "@/src/server/webhooks";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const LIVE = { PAYPAL_MODE: "live", AI_MODE: "mock" };
const SANDBOX = { PAYPAL_MODE: "live", AGENTPURSE_SANDBOX_DEMO: "1", DEMO_SESSION_SECRET: "test-secret" };

/* Answers like PayPal: without `Prefer: return=representation` an order reply has no purchase_units. */
function fakePayPal(options?: { setupStatus?: string; refuseOrder?: boolean }) {
  const calls: Array<{ path: string; method: string; headers: Headers; body: string }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ path, method, headers, body: String(init?.body ?? "") });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (path === "/v1/oauth2/token") return json({ access_token: "token", expires_in: 3600 });
    if (path.startsWith("/v3/vault/setup-tokens/")) return json({ id: path.split("/").pop(), status: options?.setupStatus ?? "APPROVED", links: [] });
    if (path === "/v3/vault/payment-tokens") {
      return json({ id: "VAULT-REAL-1", customer: { id: "CUST-1" }, payment_source: { paypal: { email_address: "buyer@personal.example.com" } } }, 201);
    }
    if (path === "/v1/notifications/verify-webhook-signature") return json({ verification_status: "SUCCESS" });
    if (path === "/v2/checkout/orders" && method === "POST") {
      if (options?.refuseOrder) return json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "PAYER_ACCOUNT_RESTRICTED" }] }, 422);
      const sent = JSON.parse(String(init?.body)) as { purchase_units: Array<{ custom_id: string; amount: unknown }> };
      const minimal = { id: "ORDER-REAL-1", status: "COMPLETED", links: [] };
      if (headers.get("prefer") !== "return=representation") return json(minimal, 201);
      return json(
        {
          ...minimal,
          intent: "CAPTURE",
          purchase_units: [{ ...sent.purchase_units[0], payments: { captures: [{ id: "CAPTURE-REAL-1", status: "COMPLETED", amount: sent.purchase_units[0].amount, custom_id: sent.purchase_units[0].custom_id }] } }],
          create_time: NOW.toISOString(),
          update_time: NOW.toISOString(),
        },
        201,
      );
    }
    throw new Error(`Unexpected PayPal call ${method} ${path}`);
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function livePayPal(sql: Sql, fetchImpl: typeof fetch) {
  return createLivePayPal({ clientId: "client", clientSecret: "secret", fetchImpl, sql });
}

async function liveHousehold() {
  const sql = await openDatabase(":memory:");
  await seedDemo(sql, { now: NOW });
  const vault = await getVault(sql, "purse_maya");
  if (!vault) throw new Error("expected a vault");
  await saveVault(sql, { ...vault, paymentTokenId: "VAULT-REAL-1", status: "vaulted" });
  return sql;
}

describe("live PayPal charges", () => {
  it("asks for the full order, records it, and writes a receipt from the real capture", async () => {
    const sql = await liveHousehold();
    const fake = fakePayPal();
    const paid = await requestPurchase(sql, "agent_grocer", "Buy oat milk and eggs from Green Grocer for $18.40", { now: NOW, env: LIVE, paypal: livePayPal(sql, fake.fetchImpl) });
    expect(paid.body.ok).toBe(true);
    if (!paid.body.ok) return;
    expect(paid.body.intent.status).toBe("captured");
    expect(paid.body.intent.captureId).toBe("CAPTURE-REAL-1");
    const stored = await getPaypalOrder(sql, "ORDER-REAL-1");
    expect(stored).toMatchObject({ intentId: paid.body.intent.id, ownerId: "purse_maya", captureId: "CAPTURE-REAL-1", amountCents: 1840, status: "COMPLETED" });
    expect(await getPaypalOrderByCustomId(sql, paid.body.intent.id)).toBeTruthy();
    await sql.close();
  });

  it("sends PayPal's documented wallet charge: only the vault id, paid to the app's own account", async () => {
    const sql = await liveHousehold();
    const fake = fakePayPal();
    await requestPurchase(sql, "agent_grocer", "Buy oat milk from Green Grocer for $4", { now: NOW, env: LIVE, paypal: livePayPal(sql, fake.fetchImpl) });
    const call = fake.calls.find((item) => item.path === "/v2/checkout/orders");
    const body = JSON.parse(call?.body ?? "{}") as { payment_source: unknown; purchase_units: Array<Record<string, unknown>> };
    expect(body.payment_source).toEqual({ paypal: { vault_id: "VAULT-REAL-1" } });
    expect(body.purchase_units[0]).not.toHaveProperty("payee");
    expect(body.purchase_units[0].custom_id).toBeTruthy();
    await sql.close();
  });

  it("lets a verified webhook find a live order", async () => {
    const sql = await liveHousehold();
    const fake = fakePayPal();
    const paid = await requestPurchase(sql, "agent_grocer", "Buy oat milk from Green Grocer for $4", { now: NOW, env: LIVE, paypal: livePayPal(sql, fake.fetchImpl) });
    if (!paid.body.ok) throw new Error("expected a payment");
    const before = (await listReceipts(sql, "purse_maya")).length;
    await sql.exec("DELETE FROM receipts WHERE capture_id = ?", ["CAPTURE-REAL-1"]);
    const event = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTURE-REAL-1", custom_id: paid.body.intent.id, amount: { currency_code: "USD", value: "4.00" } } };
    const result = await handlePaypalWebhook(
      sql,
      JSON.stringify(event),
      { transmissionId: "t1", transmissionTime: "now", transmissionSig: "sig", certUrl: "https://example.com", authAlgo: "SHA256", webhookId: "hook" },
      { paypal: livePayPal(sql, fake.fetchImpl) },
    );
    expect(result.status).toBe(200);
    expect((await listReceipts(sql, "purse_maya")).length).toBe(before);
    await sql.close();
  });

  it("marks the intent failed when PayPal refuses the charge", async () => {
    const sql = await liveHousehold();
    const fake = fakePayPal({ refuseOrder: true });
    const refused = await requestPurchase(sql, "agent_grocer", "Buy oat milk from Green Grocer for $4", { now: NOW, env: LIVE, paypal: livePayPal(sql, fake.fetchImpl) });
    expect(refused.status).toBe(422);
    const row = await sql.get("SELECT id FROM intents WHERE raw_text = ?", ["Buy oat milk from Green Grocer for $4"]);
    const intent = await getIntent(sql, String(row?.id));
    expect(intent?.status).toBe("failed");
    expect(intent?.explanation).toContain("PayPal");
    await sql.close();
  });
});

describe("linking a wallet in live mode", () => {
  async function waiting() {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    const vault = await getVault(sql, "purse_maya");
    if (!vault) throw new Error("expected a vault");
    await saveVault(sql, { ...vault, setupTokenId: "SETUP-REAL-1", paymentTokenId: null, status: "payer_action_required" });
    return sql;
  }

  it("turns an approved setup token into a saved payment token", async () => {
    const sql = await waiting();
    const linked = await finishVaultLink(sql, "purse_maya", { now: NOW, paypal: livePayPal(sql, fakePayPal().fetchImpl) });
    expect(linked.body.ok).toBe(true);
    expect(await getVault(sql, "purse_maya")).toMatchObject({ status: "vaulted", paymentTokenId: "VAULT-REAL-1", payerEmail: "buyer@personal.example.com" });
    await sql.close();
  });

  it("does not link when the payer never approved", async () => {
    const sql = await waiting();
    const linked = await finishVaultLink(sql, "purse_maya", { now: NOW, paypal: livePayPal(sql, fakePayPal({ setupStatus: "PAYER_ACTION_REQUIRED" }).fetchImpl) });
    expect(linked.body.ok).toBe(false);
    expect(await getVault(sql, "purse_maya")).toMatchObject({ status: "payer_action_required", paymentTokenId: null });
    await sql.close();
  });

  it("refuses when no link was started", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    const linked = await finishVaultLink(sql, "purse_maya", { now: NOW, paypal: livePayPal(sql, fakePayPal().fetchImpl) });
    expect(linked.status).toBe(409);
    await sql.close();
  });
});

describe("sandbox demo mode", () => {
  it("only turns on for the sandbox host with a session secret", () => {
    expect(sandboxDemo(SANDBOX)).toBe(true);
    expect(sandboxDemo({ ...SANDBOX, PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" })).toBe(true);
    expect(sandboxDemo({ ...SANDBOX, PAYPAL_API_BASE: "https://api-m.paypal.com" })).toBe(false);
    expect(sandboxDemo({ ...SANDBOX, DEMO_SESSION_SECRET: undefined })).toBe(false);
    expect(sandboxDemo({ ...SANDBOX, AGENTPURSE_SANDBOX_DEMO: undefined })).toBe(false);
    expect(sandboxDemo({ PAYPAL_MODE: "mock", AGENTPURSE_SANDBOX_DEMO: "1", DEMO_SESSION_SECRET: "x" })).toBe(false);
    expect(healthPayload(SANDBOX)).toMatchObject({ paypalMode: "live", sandboxDemo: true });
  });

  it("starts unlinked instead of trusting a mock vault", async () => {
    const saved = process.env.PAYPAL_MODE;
    process.env.PAYPAL_MODE = "live";
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    process.env.PAYPAL_MODE = saved;
    expect(await getVault(sql, "purse_maya")).toMatchObject({ paymentTokenId: null, status: "revoked" });
    await sql.close();
  });
});

describe("demo routes", () => {
  const file = `/tmp/agentpurse-sandbox-${process.pid}.db`;
  const original = { ...process.env };

  async function database(env: Record<string, string>) {
    process.env.AGENTPURSE_DB = file;
    process.env.AGENTPURSE_AUTO_SEED = "0";
    delete process.env.DATABASE_URL;
    delete process.env.DEMO_SESSION_SECRET;
    delete process.env.AGENTPURSE_SANDBOX_DEMO;
    Object.assign(process.env, { PAYPAL_MODE: "mock" }, env);
    await closeDb();
    fs.rmSync(file, { force: true });
    const sql = await getDb();
    await seedDemo(sql, { now: NOW });
    return sql;
  }

  afterAll(async () => {
    await closeDb();
    fs.rmSync(file, { force: true });
    process.env = original;
  });

  async function held(sql: Sql) {
    const hold = await requestPurchase(sql, "agent_wayfinder", "Hold a $75 seat from Metro Rail", { now: NOW, env: { PAYPAL_MODE: "mock" } });
    if (!hold.body.ok) throw new Error("expected a hold");
    return hold.body.intent.id;
  }

  function signRequest(headers: Record<string, string>) {
    return new Request("http://localhost/api/spends/x/sign", { method: "POST", headers, body: "{}" });
  }

  it("lets the signed-in owner sign a held cheque in mock mode", async () => {
    const sql = await database({});
    const id = await held(sql);
    const response = await sign(signRequest({ cookie: await demoCookieHeader() }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect((await getIntent(sql, id))?.status).toBe("captured");
  });

  it("refuses an agent key, so an agent can never approve its own purchase", async () => {
    const sql = await database({});
    const id = await held(sql);
    const response = await sign(signRequest({ authorization: `Bearer ${DEMO_KEYS.agent_wayfinder}` }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(403);
    expect((await getIntent(sql, id))?.status).toBe("pending_approval");
  });

  it("requires a passkey in real live mode", async () => {
    const sql = await database({});
    const id = await held(sql);
    const cookie = await demoCookieHeader();
    process.env.DEMO_SESSION_SECRET = "agentpurse-mock-demo-session";
    process.env.PAYPAL_MODE = "live";
    const response = await sign(signRequest({ cookie }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(401);
    expect((await getIntent(sql, id))?.status).toBe("pending_approval");
  });

  it("resets the ledger in sandbox demo mode and keeps the real wallet", async () => {
    const sql = await database({ PAYPAL_MODE: "live", AGENTPURSE_SANDBOX_DEMO: "1", DEMO_SESSION_SECRET: "test-secret" });
    const vault = await getVault(sql, "purse_maya");
    if (!vault) throw new Error("expected a vault");
    await saveVault(sql, { ...vault, paymentTokenId: "VAULT-REAL-1", status: "vaulted", payerEmail: "buyer@personal.example.com" });
    await sql.exec("UPDATE owners SET panic_frozen = 1 WHERE id = ?", ["purse_maya"]);
    const response = await reset(new Request("http://localhost/api/demo/reset", { method: "POST", headers: { cookie: await demoCookieHeader() } }));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { explanation: string }).explanation).toContain("stays linked");
    expect(await getVault(await getDb(), "purse_maya")).toMatchObject({ paymentTokenId: "VAULT-REAL-1", status: "vaulted" });
  });

  it("clears old notices, and does not claim a mock wallet stayed linked", async () => {
    const sql = await database({ PAYPAL_MODE: "live", AGENTPURSE_SANDBOX_DEMO: "1", DEMO_SESSION_SECRET: "test-secret" });
    await sql.exec("INSERT INTO notifications (id, owner_id, intent_id, title, body, delivered, created_at) VALUES ('note_old', 'purse_maya', NULL, 'Old', 'Old', 0, ?)", [NOW.toISOString()]);
    const vault = await getVault(sql, "purse_maya");
    if (!vault) throw new Error("expected a vault");
    await saveVault(sql, { ...vault, paymentTokenId: "VAULT-MOCK-MAYA", status: "vaulted" });
    const response = await reset(new Request("http://localhost/api/demo/reset", { method: "POST", headers: { cookie: await demoCookieHeader() } }));
    expect(((await response.json()) as { explanation: string }).explanation).toContain("Link PayPal");
    expect(await (await getDb()).get("SELECT id FROM notifications WHERE id = 'note_old'")).toBeUndefined();
  });

  it("gives a browser the demo session in sandbox demo mode only", async () => {
    await database({ PAYPAL_MODE: "live", AGENTPURSE_SANDBOX_DEMO: "1", DEMO_SESSION_SECRET: "test-secret" });
    const allowed = await middleware(new NextRequest("http://localhost/purses/purse_maya"));
    expect(allowed.cookies.get("ap_demo")?.value).toBeTruthy();
    delete process.env.AGENTPURSE_SANDBOX_DEMO;
    const closed = await middleware(new NextRequest("http://localhost/purses/purse_maya"));
    expect(closed.cookies.get("ap_demo")).toBeUndefined();
  });
});

describe("agent limits over MCP", () => {
  async function setup() {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    const grocer = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    const wayfinder = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_wayfinder}`);
    if (!grocer || !wayfinder) throw new Error("expected demo actors");
    return { sql, grocer, wayfinder };
  }

  const text = (result: { content: Array<{ text: string }> }) => result.content[0].text;

  async function quoteFor(sql: Sql, actor: { ownerId: string; agentId: string | null }) {
    const quote = await callTool(sql, actor, "get_quote", { merchant: "Green Grocer", amountCents: 400, description: "oat milk", originalTask: "Buy oat milk from Green Grocer" });
    return (JSON.parse(text(quote as never)) as { quoteId: string }).quoteId;
  }

  it("ignores another agent's id on an agent key", async () => {
    const { sql, grocer } = await setup();
    const result = await callTool(sql, grocer, "request_purchase", { agentId: "agent_wayfinder", text: "Buy oat milk from Green Grocer for $4" });
    const body = JSON.parse(text(result as never)) as { intent: { agentId: string } };
    expect(body.intent.agentId).toBe("agent_grocer");
    await sql.close();
  });

  it("refuses another agent's quote", async () => {
    const { sql, grocer, wayfinder } = await setup();
    const quoteId = await quoteFor(sql, grocer);
    const result = (await callTool(sql, wayfinder, "request_purchase", { quoteId })) as { isError?: boolean };
    expect(result.isError).toBe(true);
    await sql.close();
  });

  it("spends a quote only once", async () => {
    const { sql, grocer } = await setup();
    const quoteId = await quoteFor(sql, grocer);
    const first = await callTool(sql, grocer, "request_purchase", { quoteId });
    expect(JSON.parse(text(first as never)).intent.status).toBe("captured");
    const second = (await callTool(sql, grocer, "request_purchase", { quoteId })) as { isError?: boolean };
    expect(second.isError).toBe(true);
    await sql.close();
  });

  it("refuses a quote from another household", async () => {
    const { sql, grocer } = await setup();
    const quoteId = await quoteFor(sql, grocer);
    const stranger = (await callTool(sql, { ownerId: "someone_else", agentId: null }, "request_purchase", { quoteId })) as { isError?: boolean };
    expect(stranger.isError).toBe(true);
    await sql.close();
  });
});
