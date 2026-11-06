/**
 * PayPal Agent Toolkit bridge.
 *
 * AgentPurse passes a short list of read-only PayPal Agent Toolkit tools through
 * its own MCP server. Tools that move money (orders, captures, invoices, refunds,
 * subscriptions, payouts) are never handed to the toolkit. They are refused here
 * and the agent is told to use `request_purchase`, where the intent guard and the
 * clerk in `src/policy/engine.ts` decide.
 *
 * The toolkit package loads only when PAYPAL_MODE=live. Mock mode answers the same
 * read tools from the local `paypal_orders` table with no keys and no network.
 */
import { z } from "zod";
import { paypalMode, type AppEnv } from "@/src/config";
import type { Sql, SqlValue } from "@/src/db/sql";
import { centsToDecimal } from "@/src/domain/money";

/** AgentPurse tool name -> toolkit method. The only toolkit methods that may run. */
export const TOOLKIT_READ_TOOLS = {
  paypal_get_order: "get_order",
  paypal_list_transactions: "list_transactions",
  paypal_list_disputes: "list_disputes",
  paypal_get_dispute: "get_dispute",
} as const;

export type ToolkitReadTool = keyof typeof TOOLKIT_READ_TOOLS;
export type ToolkitReadMethod = (typeof TOOLKIT_READ_TOOLS)[ToolkitReadTool];

/**
 * The toolkit configuration AgentPurse builds. Only read actions are switched on,
 * so the toolkit's own filter drops every money tool before our allowlist is even asked.
 */
export const TOOLKIT_READ_ACTIONS = {
  orders: { get: true },
  transactions: { list: true },
  disputes: { list: true, get: true },
} as const;

/**
 * Toolkit methods that move money or commit the merchant to money moving.
 * An agent that names one gets pointed at `request_purchase`. Every other unknown
 * `paypal_*` name is refused too; this list only makes the refusal explain itself.
 */
export const TOOLKIT_MONEY_METHODS = new Set([
  "create_order",
  "pay_order",
  "create_refund",
  "create_invoice",
  "send_invoice",
  "send_invoice_reminder",
  "record_payment_for_invoice",
  "record_refund_for_invoice",
  "create_recurring_series",
  "activate_recurring_series",
  "create_subscription",
  "update_subscription",
  "create_subscription_plan",
  "accept_dispute_claim",
  "create_payout",
  "create_batch_payout",
]);

export function isToolkitReadTool(name: string): name is ToolkitReadTool {
  return Object.prototype.hasOwnProperty.call(TOOLKIT_READ_TOOLS, name);
}

/** True for any `paypal_*` tool name that is not on the read allowlist. */
export function isBlockedToolkitTool(name: string): boolean {
  return name.startsWith("paypal_") && !isToolkitReadTool(name);
}

export function blockedToolkitMessage(name: string): string {
  const method = name.replace(/^paypal_/, "");
  if (TOOLKIT_MONEY_METHODS.has(method)) {
    return `${name} moves money, so AgentPurse does not expose it. Call request_purchase (or get_quote, then request_purchase) with the user's original task. The clerk decides whether PayPal is charged.`;
  }
  return `${name} is not an AgentPurse tool. Only these PayPal Agent Toolkit tools pass through, read-only: ${Object.keys(TOOLKIT_READ_TOOLS).join(", ")}.`;
}

export const TOOLKIT_MCP_TOOLS = [
  {
    name: "paypal_get_order",
    description: "PayPal Agent Toolkit get_order, read-only. Read one PayPal order this purse created. Does not move money.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "paypal_list_transactions",
    description: "PayPal Agent Toolkit list_transactions, read-only. List this purse's PayPal transactions. Does not move money.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        start_date: { type: "string", description: "ISO 8601, seconds required" },
        end_date: { type: "string", description: "ISO 8601, at most 31 days after start_date" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "paypal_list_disputes",
    description: "PayPal Agent Toolkit list_disputes, read-only. List disputes on this purse's payments. Does not move money.",
    inputSchema: {
      type: "object",
      properties: {
        dispute_state: {
          type: "string",
          enum: ["REQUIRED_ACTION", "REQUIRED_OTHER_PARTY_ACTION", "UNDER_PAYPAL_REVIEW", "RESOLVED", "OPEN_INQUIRIES", "APPEALABLE"],
        },
        page_size: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "paypal_get_dispute",
    description: "PayPal Agent Toolkit get_dispute, read-only. Read one dispute on this purse's payments. Does not move money.",
    inputSchema: { type: "object", properties: { dispute_id: { type: "string" } }, required: ["dispute_id"], additionalProperties: false },
  },
] as const;

const ARGS = {
  get_order: z.object({ id: z.string().min(1).max(64) }).strict(),
  list_transactions: z
    .object({ transaction_id: z.string().min(1).max(64).optional(), start_date: z.string().optional(), end_date: z.string().optional() })
    .strict(),
  list_disputes: z
    .object({
      dispute_state: z
        .enum(["REQUIRED_ACTION", "REQUIRED_OTHER_PARTY_ACTION", "UNDER_PAYPAL_REVIEW", "RESOLVED", "OPEN_INQUIRIES", "APPEALABLE"])
        .optional(),
      page_size: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  get_dispute: z.object({ dispute_id: z.string().min(1).max(64) }).strict(),
} satisfies Record<ToolkitReadMethod, z.ZodTypeAny>;

/** Runs one read method. Live wraps the toolkit; mock reads the local ledger. */
export interface ToolkitRunner {
  readonly mode: "mock" | "live";
  run(method: ToolkitReadMethod, args: Record<string, unknown>): Promise<unknown>;
}

/** The owner's slice of PayPal: which orders and captures belong to this caller. */
export interface ToolkitScope {
  ownerId: string;
  agentId: string | null;
}

interface OwnedOrder {
  id: string;
  captureId: string | null;
  status: string;
  currency: string;
  amountCents: number;
  customId: string | null;
  rawJson: string;
  createdAt: string;
}

async function ownedOrders(sql: Sql, scope: ToolkitScope): Promise<OwnedOrder[]> {
  const params: SqlValue[] = [scope.ownerId];
  let where = "o.owner_id = ?";
  if (scope.agentId) {
    where += " AND i.agent_id = ?";
    params.push(scope.agentId);
  }
  const rows = await sql.all(
    `SELECT o.id, o.capture_id, o.status, o.currency, o.amount_cents, o.custom_id, o.raw_json, o.created_at
       FROM paypal_orders o LEFT JOIN intents i ON i.id = o.intent_id
      WHERE ${where} ORDER BY o.created_at DESC`,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id),
    captureId: row.capture_id ? String(row.capture_id) : null,
    status: String(row.status),
    currency: String(row.currency),
    amountCents: Number(row.amount_cents),
    customId: row.custom_id ? String(row.custom_id) : null,
    rawJson: String(row.raw_json),
    createdAt: String(row.created_at),
  }));
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mock answers in the same shape PayPal's REST APIs return, from the local ledger. */
export function createMockToolkitRunner(sql: Sql, scope: ToolkitScope): ToolkitRunner {
  return {
    mode: "mock",
    async run(method, args) {
      const orders = await ownedOrders(sql, scope);
      if (method === "get_order") {
        const order = orders.find((row) => row.id === args.id);
        if (!order) throw new ToolkitError("Unknown PayPal order for this purse.");
        return {
          ...parseJson(order.rawJson),
          id: order.id,
          status: order.status,
          purchase_units: (parseJson(order.rawJson).purchase_units as unknown) ?? [
            {
              custom_id: order.customId ?? undefined,
              amount: { currency_code: order.currency, value: centsToDecimal(order.amountCents) },
              payments: order.captureId ? { captures: [{ id: order.captureId, status: "COMPLETED" }] } : undefined,
            },
          ],
        };
      }
      if (method === "list_transactions") {
        const details = orders
          .filter((row) => row.captureId && (!args.transaction_id || row.captureId === args.transaction_id))
          .map((row) => ({
            transaction_info: {
              transaction_id: row.captureId,
              paypal_reference_id: row.id,
              transaction_status: "S",
              transaction_amount: { currency_code: row.currency, value: centsToDecimal(row.amountCents) },
              transaction_initiation_date: row.createdAt,
              custom_field: row.customId ?? undefined,
            },
          }));
        return { transaction_details: details, total_items: details.length, total_pages: 1, page: 1 };
      }
      if (method === "list_disputes") return { items: [], links: [] };
      throw new ToolkitError("Unknown dispute for this purse.");
    },
  };
}

export class ToolkitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolkitError";
  }
}

/** The slice of `@paypal/agent-toolkit/mcp` this bridge uses. */
export interface LoadedToolkit {
  getTools(): Array<{ method: string; parameters: { parse(value: unknown): unknown } }>;
  getPaypalAPIService(): { run(method: string, arg: unknown): Promise<string> };
}

export type ToolkitLoader = (input: { accessToken: string; sandbox: boolean }) => Promise<LoadedToolkit>;

/** Loads the official package. Only reached when PAYPAL_MODE=live. */
export const loadPayPalAgentToolkit: ToolkitLoader = async ({ accessToken, sandbox }) => {
  const { PayPalMCPToolkit } = await import("@paypal/agent-toolkit/mcp");
  return new PayPalMCPToolkit({
    accessToken,
    configuration: { actions: TOOLKIT_READ_ACTIONS as unknown as Record<string, Record<string, boolean>>, context: { sandbox } },
  }) as unknown as LoadedToolkit;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function clientCredentialsToken(env: AppEnv, base: string, fetchImpl: FetchLike): Promise<string> {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetchImpl(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new ToolkitError(`PayPal auth failed (${response.status}).`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new ToolkitError("PayPal auth response did not include a token.");
  return json.access_token;
}

/** Live: run the official toolkit, then keep only what belongs to this caller. */
export function createLiveToolkitRunner(
  sql: Sql,
  scope: ToolkitScope,
  options: { env?: AppEnv; loader?: ToolkitLoader; fetchImpl?: FetchLike } = {},
): ToolkitRunner {
  const env = options.env ?? process.env;
  const base = (env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
  const sandbox = new URL(base).hostname.includes("sandbox");
  let toolkit: Promise<LoadedToolkit> | null = null;
  function load(): Promise<LoadedToolkit> {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
      return Promise.reject(new ToolkitError("PAYPAL_MODE=live needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the Agent Toolkit."));
    }
    toolkit ??= clientCredentialsToken(env, base, options.fetchImpl ?? fetch).then((accessToken) =>
      (options.loader ?? loadPayPalAgentToolkit)({ accessToken, sandbox }),
    );
    return toolkit;
  }

  return {
    mode: "live",
    async run(method, args) {
      const orders = await ownedOrders(sql, scope);
      const captures = new Set(orders.map((row) => row.captureId).filter((id): id is string => Boolean(id)));
      if (method === "get_order" && !orders.some((row) => row.id === args.id)) {
        throw new ToolkitError("Unknown PayPal order for this purse.");
      }
      const loaded = await load();
      const tool = loaded.getTools().find((item) => item.method === method);
      if (!tool) throw new ToolkitError(`The PayPal Agent Toolkit did not load ${method}.`);
      // The toolkit's own zod schema fills its defaults (such as the 31-day window).
      const parsed = tool.parameters.parse(args);
      const output = parseJson(await loaded.getPaypalAPIService().run(method, parsed));
      if (method === "list_transactions") {
        const details = Array.isArray(output.transaction_details) ? output.transaction_details : [];
        const mine = details.filter((item) => captures.has(String((item as { transaction_info?: { transaction_id?: string } }).transaction_info?.transaction_id ?? "")));
        return { ...output, transaction_details: mine, total_items: mine.length };
      }
      if (method === "list_disputes" || method === "get_dispute") {
        const ownsDispute = (dispute: unknown) =>
          ((dispute as { disputed_transactions?: Array<{ seller_transaction_id?: string }> }).disputed_transactions ?? []).some((item) =>
            captures.has(String(item.seller_transaction_id ?? "")),
          );
        if (method === "get_dispute") {
          if (!ownsDispute(output)) throw new ToolkitError("Unknown dispute for this purse.");
          return output;
        }
        const items = Array.isArray(output.items) ? output.items.filter(ownsDispute) : [];
        return { ...output, items };
      }
      return output;
    },
  };
}

export function createToolkitRunner(sql: Sql, scope: ToolkitScope, env: AppEnv = process.env): ToolkitRunner {
  return paypalMode(env) === "live" ? createLiveToolkitRunner(sql, scope, { env }) : createMockToolkitRunner(sql, scope);
}

/** Validate, then run one allowlisted read tool. Money tools never reach here. */
export async function runToolkitReadTool(runner: ToolkitRunner, name: ToolkitReadTool, args: Record<string, unknown>): Promise<unknown> {
  const method = TOOLKIT_READ_TOOLS[name];
  const parsed = ARGS[method].safeParse(args);
  if (!parsed.success) throw new ToolkitError(`Bad arguments for ${name}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  return runner.run(method, parsed.data as Record<string, unknown>);
}
