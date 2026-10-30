import { assessIntent } from "@/src/ai/guard";
import { merchantPayee } from "@/src/domain/payee";
import { formatMoney } from "@/src/domain/money";
import {
  findMerchantByName,
  getAgent,
  getOwner,
  getQuote,
  getVault,
  insertQuote,
  listAgents,
  listMerchants,
  listReceipts,
  netSpentCents,
  newId,
  searchMerchants,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { requestPurchase } from "@/src/server/actions";

export interface McpActor {
  ownerId: string;
  agentId: string | null;
}

interface Rpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const PROTOCOL = "2025-11-25";

export const MCP_TOOLS = [
  {
    name: "search_merchants",
    description: "Find merchants AgentPurse can pay.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "get_quote",
    description: "Quote a purchase. Does not move money.",
    inputSchema: {
      type: "object",
      properties: {
        merchant: { type: "string" },
        amountCents: { type: "integer" },
        description: { type: "string" },
        originalTask: { type: "string" },
      },
      required: ["merchant", "amountCents", "description", "originalTask"],
    },
  },
  {
    name: "request_purchase",
    description: "Ask the clerk to pay a quote or a sentence. The clerk can deny or hold it.",
    inputSchema: {
      type: "object",
      properties: {
        quoteId: { type: "string" },
        text: { type: "string" },
        originalTask: { type: "string" },
        pageExcerpt: { type: "string" },
        agentId: { type: "string" },
      },
    },
  },
  {
    name: "get_budget",
    description: "Read remaining allowances. Does not move money.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_receipts",
    description: "List PayPal receipts for this purse.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function budget(sql: Sql, actor: McpActor) {
  const agents = (await listAgents(sql, actor.ownerId)).filter((agent) => !actor.agentId || agent.id === actor.agentId);
  return Promise.all(
    agents.map(async (agent) => {
      const spent = await netSpentCents(sql, agent.id);
      return {
        agentId: agent.id,
        name: agent.name,
        provider: agent.provider,
        status: agent.status,
        allowanceCents: agent.allowanceCents,
        spentCents: spent,
        remainingCents: agent.allowanceCents - spent,
        remaining: formatMoney(agent.allowanceCents - spent),
      };
    }),
  );
}

export async function callTool(sql: Sql, actor: McpActor, name: string, args: Record<string, unknown>) {
  if (name === "search_merchants") {
    const query = typeof args.query === "string" ? args.query : "";
    const merchants = query ? await searchMerchants(sql, query) : await listMerchants(sql);
    return textResult(merchants.map((merchant) => ({ name: merchant.name, category: merchant.category, trusted: merchant.trusted, blocked: merchant.blocked })));
  }
  if (name === "get_budget") return textResult(await budget(sql, actor));
  if (name === "list_receipts") {
    const receipts = await listReceipts(sql, actor.ownerId, actor.agentId ?? undefined);
    return textResult(receipts);
  }
  if (name === "get_quote") {
    const merchantName = String(args.merchant ?? "");
    const merchant = await findMerchantByName(sql, merchantName);
    if (!merchant) return { isError: true, content: [{ type: "text", text: `Unknown merchant ${merchantName}` }] };
    const agentId = actor.agentId ?? (await listAgents(sql, actor.ownerId))[0]?.id;
    if (!agentId) return { isError: true, content: [{ type: "text", text: "No agent is available." }] };
    const amountCents = Number(args.amountCents);
    const id = newId("quote");
    const now = new Date();
    await insertQuote(sql, {
      id,
      agentId,
      merchantName: merchant.name,
      merchantEmail: merchant.paypalEmail || merchantPayee(),
      category: merchant.category,
      amountCents,
      currency: "USD",
      description: String(args.description ?? ""),
      originalTask: String(args.originalTask ?? ""),
      pageExcerpt: null,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
    });
    const guard = assessIntent({
      originalTask: String(args.originalTask ?? ""),
      merchantName: merchant.name,
      amountCents,
      category: merchant.category,
      purpose: String(args.description ?? ""),
    });
    return textResult({ quoteId: id, merchant: merchant.name, amountCents, guard });
  }
  if (name === "request_purchase") {
    const agentId = typeof args.agentId === "string" ? args.agentId : actor.agentId;
    let text = typeof args.text === "string" ? args.text : "";
    let originalTask = typeof args.originalTask === "string" ? args.originalTask : text;
    let pageExcerpt = typeof args.pageExcerpt === "string" ? args.pageExcerpt : undefined;
    if (typeof args.quoteId === "string") {
      const quote = await getQuote(sql, args.quoteId);
      if (!quote) return { isError: true, content: [{ type: "text", text: "Unknown quote." }] };
      if (String(quote.expires_at) < new Date().toISOString()) return { isError: true, content: [{ type: "text", text: "Quote expired." }] };
      text = `${quote.description} from ${quote.merchant_name} for $${(Number(quote.amount_cents) / 100).toFixed(2)}`;
      originalTask = String(quote.original_task);
      pageExcerpt = quote.page_excerpt ? String(quote.page_excerpt) : pageExcerpt;
    }
    const resolved = agentId ?? (await listAgents(sql, actor.ownerId))[0]?.id;
    if (!resolved) return { isError: true, content: [{ type: "text", text: "No agent is available." }] };
    const result = await requestPurchase(sql, resolved, text, { originalTask, pageExcerpt });
    return textResult(result.body);
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function handleMcpMessage(sql: Sql, actor: McpActor, message: Rpc): Promise<Record<string, unknown> | null> {
  if (message.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
  if (message.id === undefined) return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "agentpurse", version: "0.2.0" },
      },
    };
  }
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: MCP_TOOLS } };
  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
    try {
      const result = await callTool(sql, actor, name, args);
      return { jsonrpc: "2.0", id: message.id, result };
    } catch (error) {
      return { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : "Tool failed" } };
    }
  }
  return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method ?? ""}` } };
}

export function encodeStdio(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

export function decodeStdio(buffer: string): { messages: unknown[]; rest: string } {
  const messages: unknown[] = [];
  let rest = buffer;
  while (true) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const header = rest.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) break;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (Buffer.byteLength(rest.slice(start), "utf8") < length) break;
    const body = Buffer.from(rest.slice(start), "utf8").subarray(0, length).toString("utf8");
    messages.push(JSON.parse(body));
    rest = Buffer.from(rest.slice(start), "utf8").subarray(length).toString("utf8");
  }
  return { messages, rest };
}

export async function actorFromBearer(sql: Sql, authorization: string | null): Promise<McpActor | null> {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  const { getAgentByApiKey } = await import("@/src/db/repository");
  const agent = await getAgentByApiKey(sql, token);
  if (agent) return { ownerId: agent.ownerId, agentId: agent.id };
  const row = await sql.get("SELECT owner_id, agent_id, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'", [
    (await import("node:crypto")).createHash("sha256").update(token).digest("hex"),
  ]);
  if (!row) return null;
  if (row.expires_at && String(row.expires_at) < new Date().toISOString()) return null;
  return { ownerId: String(row.owner_id), agentId: row.agent_id ? String(row.agent_id) : null };
}

export function allowedOrigin(origin: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true;
  const allowed = new Set(["http://localhost:3000", "http://127.0.0.1:3000", env.PUBLIC_BASE_URL, env.WEBAUTHN_ORIGIN].filter(Boolean));
  return allowed.has(origin);
}

void getAgent;
void getOwner;
void getVault;
