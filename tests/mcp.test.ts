import { describe, expect, it } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import { actorFromBearer, decodeStdio, encodeStdio, handleMcpMessage } from "@/src/mcp/protocol";
import { codeChallenge, exchangeCode, issueCode, registerClient } from "@/src/oauth/flow";

describe("MCP", () => {
  it("lists tools and buys through a quote with an agent API key", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql);
    const actor = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    expect(actor?.agentId).toBe("agent_grocer");
    if (!actor) return;
    const init = await handleMcpMessage(sql, actor, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(init).toMatchObject({ result: { protocolVersion: "2025-11-25", serverInfo: { name: "agentpurse" } } });
    expect(await handleMcpMessage(sql, actor, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const tools = await handleMcpMessage(sql, actor, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = ((tools as { result: { tools: Array<{ name: string }> } }).result.tools).map((tool) => tool.name);
    expect(names).toEqual(["search_merchants", "get_quote", "request_purchase", "get_budget", "list_receipts"]);

    const quote = await handleMcpMessage(sql, actor, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_quote", arguments: { merchant: "Green Grocer", amountCents: 1840, description: "oat milk", originalTask: "Buy oat milk from Green Grocer" } },
    });
    const quoted = JSON.parse((quote as { result: { content: Array<{ text: string }> } }).result.content[0].text) as { quoteId: string };
    const purchase = await handleMcpMessage(sql, actor, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "request_purchase", arguments: { quoteId: quoted.quoteId } },
    });
    const body = JSON.parse((purchase as { result: { content: Array<{ text: string }> } }).result.content[0].text) as { ok: boolean; intent: { id: string; status: string } };
    expect(body.ok).toBe(true);
    expect(body.intent.status).toBe("captured");

    const framed = encodeStdio({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(decodeStdio(framed).messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    await sql.close();
  });

  it("issues an OAuth access token with PKCE and reads the budget", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql);
    const client = await registerClient(sql, { clientName: "Grok Bot", redirectUris: ["https://grok.example/callback"] });
    const verifier = "a".repeat(50);
    const code = await issueCode(sql, {
      clientId: client.client_id,
      ownerId: "purse_maya",
      redirectUri: "https://grok.example/callback",
      codeChallenge: codeChallenge(verifier),
      method: "S256",
      scope: "purse",
    });
    const token = await exchangeCode(sql, { code, verifier, redirectUri: "https://grok.example/callback", clientId: client.client_id });
    const actor = await actorFromBearer(sql, `Bearer ${token.access_token}`);
    expect(actor?.ownerId).toBe("purse_maya");
    if (!actor) return;
    const budget = await handleMcpMessage(sql, actor, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_budget", arguments: {} } });
    const rows = JSON.parse((budget as { result: { content: Array<{ text: string }> } }).result.content[0].text) as Array<{ name: string }>;
    expect(rows.map((row) => row.name).sort()).toEqual(["Grocer", "Handy", "Stack", "Wayfinder"]);
    await sql.close();
  });
});
