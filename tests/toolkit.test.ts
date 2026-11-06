import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import type { Sql } from "@/src/db/sql";
import { actorFromBearer, callTool, handleMcpMessage, MCP_TOOLS, type McpActor } from "@/src/mcp/protocol";
import {
  TOOLKIT_MONEY_METHODS,
  TOOLKIT_READ_ACTIONS,
  TOOLKIT_READ_TOOLS,
  createLiveToolkitRunner,
  createToolkitRunner,
  type LoadedToolkit,
  type ToolkitRunner,
} from "@/src/paypal/toolkit";

const HOUSEHOLD: McpActor = { ownerId: "purse_maaz", agentId: null };

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };

function json(result: unknown) {
  return JSON.parse((result as ToolResult).content[0].text) as Record<string, unknown>;
}

async function counts(sql: Sql) {
  const orders = await sql.get("SELECT COUNT(*) AS n FROM paypal_orders");
  const intents = await sql.get("SELECT COUNT(*) AS n FROM intents");
  const receipts = await sql.get("SELECT COUNT(*) AS n FROM receipts");
  return { orders: Number(orders?.n), intents: Number(intents?.n), receipts: Number(receipts?.n) };
}

/** A runner that records every call. If the wall leaks, `calls` is not empty. */
function spyRunner(): ToolkitRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    mode: "live",
    calls,
    async run(method) {
      calls.push(method);
      return { leaked: true };
    },
  };
}

async function demo() {
  const sql = await openDatabase(":memory:");
  await seedDemo(sql);
  return sql;
}

describe("PayPal Agent Toolkit wall", () => {
  it("lists the read-only toolkit tools and no money tools", () => {
    const names: string[] = MCP_TOOLS.map((tool) => tool.name);
    for (const read of Object.keys(TOOLKIT_READ_TOOLS)) expect(names).toContain(read);
    for (const method of TOOLKIT_MONEY_METHODS) {
      expect(names).not.toContain(method);
      expect(names).not.toContain(`paypal_${method}`);
    }
    // The only way to spend is still request_purchase.
    expect(names).toContain("request_purchase");
  });

  it("refuses every money-moving toolkit tool before the toolkit runs", async () => {
    const sql = await demo();
    const actor = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    if (!actor) throw new Error("demo key did not resolve");
    const before = await counts(sql);
    const spy = spyRunner();
    const attempts: Array<[string, Record<string, unknown>]> = [
      ["paypal_create_order", { currencyCode: "USD", items: [{ name: "oat milk", itemCost: 18.4, quantity: 1 }] }],
      ["paypal_pay_order", { id: "PAY-MOCK-CLOUD012" }],
      ["paypal_create_invoice", { detail: { currency_code: "USD" }, items: [{ name: "gift", unit_amount: { currency_code: "USD", value: "500.00" } }] }],
      ["paypal_send_invoice", { invoice_id: "INV2-AAAA-BBBB-CCCC-DDDD" }],
      ["paypal_create_refund", { capture_id: "CAP-MOCK-CLOUD012" }],
      ["paypal_create_subscription", { plan_id: "P-123" }],
      ["paypal_accept_dispute_claim", { dispute_id: "PP-D-1" }],
      ["paypal_create_payout", { amount: "900.00", receiver: "attacker@example.com" }],
      ["paypal_anything_else", {}],
    ];
    for (const [name, args] of attempts) {
      const result = (await callTool(sql, actor, name, args, { toolkit: () => spy })) as ToolResult;
      expect(result.isError, name).toBe(true);
      if (TOOLKIT_MONEY_METHODS.has(name.replace(/^paypal_/, ""))) expect(result.content[0].text).toContain("request_purchase");
    }
    // A bare toolkit name is not a tool either.
    const bare = await handleMcpMessage(sql, actor, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "create_order", arguments: {} } }, { toolkit: () => spy });
    expect(bare).toMatchObject({ error: { message: "Unknown tool create_order" } });

    expect(spy.calls).toEqual([]);
    expect(await counts(sql)).toEqual(before);
    await sql.close();
  });

  it("sends the same spend through request_purchase, where the clerk decides", async () => {
    const sql = await demo();
    const actor = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    if (!actor) throw new Error("demo key did not resolve");
    const refused = (await callTool(sql, actor, "paypal_create_order", { items: [{ name: "Gaming PC", itemCost: 2400 }] })) as ToolResult;
    expect(refused.isError).toBe(true);
    const routed = json(
      await callTool(sql, actor, "request_purchase", { text: "Buy a gaming PC from Best Buy for $2400", originalTask: "Buy oat milk" }),
    ) as { ok: boolean; intent?: { status: string } };
    expect(routed.intent?.status).not.toBe("captured");
    await sql.close();
  });

  it("answers the read-only tools from the mock ledger with no keys or network", async () => {
    const sql = await demo();
    const runner = createToolkitRunner(sql, HOUSEHOLD, { PAYPAL_MODE: "mock" });
    expect(runner.mode).toBe("mock");

    const order = json(await callTool(sql, HOUSEHOLD, "paypal_get_order", { id: "PAY-MOCK-CLOUD012" }));
    expect(order).toMatchObject({ id: "PAY-MOCK-CLOUD012", status: "COMPLETED" });

    const txns = json(await callTool(sql, HOUSEHOLD, "paypal_list_transactions", {})) as {
      transaction_details: Array<{ transaction_info: { transaction_id: string; transaction_amount: { value: string } } }>;
    };
    const cloud = txns.transaction_details.find((item) => item.transaction_info.transaction_id === "CAP-MOCK-CLOUD012");
    expect(cloud?.transaction_info.transaction_amount.value).toBe("12.00");

    expect(json(await callTool(sql, HOUSEHOLD, "paypal_list_disputes", {}))).toMatchObject({ items: [] });
    expect(((await callTool(sql, HOUSEHOLD, "paypal_get_dispute", { dispute_id: "PP-D-1" })) as ToolResult).isError).toBe(true);
    expect(((await callTool(sql, HOUSEHOLD, "paypal_get_order", { id: "PAY-1", extra: "x" })) as ToolResult).isError).toBe(true);
    await sql.close();
  });

  it("scopes reads to the caller's own agent and household", async () => {
    const sql = await demo();
    const grocer = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    const stack = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_stack}`);
    if (!grocer || !stack) throw new Error("demo keys did not resolve");
    expect(json(await callTool(sql, stack, "paypal_get_order", { id: "PAY-MOCK-CLOUD012" }))).toMatchObject({ id: "PAY-MOCK-CLOUD012" });
    expect(((await callTool(sql, grocer, "paypal_get_order", { id: "PAY-MOCK-CLOUD012" })) as ToolResult).isError).toBe(true);
    const stranger: McpActor = { ownerId: "someone_else", agentId: null };
    expect(((await callTool(sql, stranger, "paypal_get_order", { id: "PAY-MOCK-CLOUD012" })) as ToolResult).isError).toBe(true);
    expect(json(await callTool(sql, stranger, "paypal_list_transactions", {}))).toMatchObject({ transaction_details: [] });
    await sql.close();
  });

  it("live mode runs the toolkit and drops other households' rows", async () => {
    const sql = await demo();
    const runs: string[] = [];
    const fake: LoadedToolkit = {
      getTools: () => [
        { method: "get_order", parameters: { parse: (value: unknown) => value } },
        { method: "list_transactions", parameters: { parse: (value: unknown) => value } },
      ],
      getPaypalAPIService: () => ({
        async run(method: string) {
          runs.push(method);
          if (method === "get_order") return JSON.stringify({ id: "PAY-MOCK-CLOUD012", status: "COMPLETED" });
          return JSON.stringify({
            transaction_details: [
              { transaction_info: { transaction_id: "CAP-MOCK-CLOUD012" } },
              { transaction_info: { transaction_id: "CAP-OTHER-HOUSEHOLD" } },
            ],
          });
        },
      }),
    };
    const fetchImpl = async () => Response.json({ access_token: "A21-test", expires_in: 3600 });
    const runner = createLiveToolkitRunner(sql, HOUSEHOLD, {
      env: { PAYPAL_MODE: "live", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" },
      loader: async () => fake,
      fetchImpl,
    });
    const txns = json(await callTool(sql, HOUSEHOLD, "paypal_list_transactions", {}, { toolkit: () => runner })) as {
      transaction_details: Array<{ transaction_info: { transaction_id: string } }>;
    };
    expect(txns.transaction_details.map((item) => item.transaction_info.transaction_id)).toEqual(["CAP-MOCK-CLOUD012"]);
    const foreign = (await callTool(sql, HOUSEHOLD, "paypal_get_order", { id: "PAY-NOT-OURS" }, { toolkit: () => runner })) as ToolResult;
    expect(foreign.isError).toBe(true);
    expect(runs).toEqual(["list_transactions"]);
    await sql.close();
  });

  it("configures the official toolkit with read actions only", async () => {
    const { PayPalMCPToolkit } = await import("@paypal/agent-toolkit/mcp");
    const toolkit = new PayPalMCPToolkit({
      accessToken: "A21-not-a-real-token",
      configuration: { actions: TOOLKIT_READ_ACTIONS as unknown as Record<string, Record<string, boolean>>, context: { sandbox: true } },
    });
    const methods = toolkit.getTools().map((tool) => tool.method).sort();
    expect(methods).toEqual([...Object.values(TOOLKIT_READ_TOOLS)].sort());
    for (const method of methods) expect(TOOLKIT_MONEY_METHODS.has(method)).toBe(false);
  });
});
