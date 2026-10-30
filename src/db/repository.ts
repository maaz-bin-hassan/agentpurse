import { createHash, randomBytes } from "node:crypto";
import {
  isCategory,
  type Agent,
  type AgentStatus,
  type Approval,
  type AuditEvent,
  type Category,
  type Decision,
  type IntentRecord,
  type IntentStatus,
  type Merchant,
  type Owner,
  type Receipt,
  type RuleHit,
  type Vault,
  type VaultStatus,
} from "@/src/domain/types";
import type { Sql, SqlRow, SqlValue } from "@/src/db/sql";

function text(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected text in ${key}`);
  return value;
}

function nullableText(row: SqlRow, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`Expected text in ${key}`);
  return value;
}

function integer(row: SqlRow, key: string): number {
  const value = row[key];
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) throw new Error(`Expected integer in ${key}`);
  return number;
}

function nullableInteger(row: SqlRow, key: string): number | null {
  if (row[key] == null) return null;
  return integer(row, key);
}

function flag(row: SqlRow, key: string): boolean {
  return integer(row, key) === 1;
}

function hits(raw: string): RuleHit[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.code !== "string" || typeof record.sentence !== "string") return [];
    return [{ code: record.code, sentence: record.sentence }];
  });
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export async function countOwners(sql: Sql): Promise<number> {
  const row = await sql.get("SELECT COUNT(*) AS n FROM owners");
  return row ? integer(row, "n") : 0;
}

export async function getOwner(sql: Sql, id: string): Promise<Owner | undefined> {
  const row = await sql.get("SELECT * FROM owners WHERE id = ?", [id]);
  if (!row) return undefined;
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    email: text(row, "email"),
    panicFrozen: flag(row, "panic_frozen"),
    createdAt: text(row, "created_at"),
  };
}

export async function insertOwner(sql: Sql, owner: Owner): Promise<void> {
  await sql.exec(
    `INSERT INTO owners (id, name, email, panic_frozen, created_at) VALUES (?, ?, ?, ?, ?)`,
    [owner.id, owner.name, owner.email, owner.panicFrozen ? 1 : 0, owner.createdAt],
  );
}

export async function setPanic(sql: Sql, ownerId: string, frozen: boolean): Promise<void> {
  await sql.exec("UPDATE owners SET panic_frozen = ? WHERE id = ?", [frozen ? 1 : 0, ownerId]);
}

export async function getVault(sql: Sql, ownerId: string): Promise<Vault | undefined> {
  const row = await sql.get("SELECT * FROM vaults WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", [ownerId]);
  if (!row) return undefined;
  return {
    id: text(row, "id"),
    ownerId: text(row, "owner_id"),
    setupTokenId: nullableText(row, "setup_token_id"),
    paymentTokenId: nullableText(row, "payment_token_id"),
    paypalCustomerId: nullableText(row, "paypal_customer_id"),
    payerEmail: nullableText(row, "payer_email"),
    status: text(row, "status") as VaultStatus,
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export async function saveVault(sql: Sql, vault: Vault): Promise<void> {
  await sql.exec("DELETE FROM vaults WHERE owner_id = ?", [vault.ownerId]);
  await sql.exec(
    `INSERT INTO vaults (
      id, owner_id, setup_token_id, payment_token_id, paypal_customer_id, payer_email, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vault.id,
      vault.ownerId,
      vault.setupTokenId,
      vault.paymentTokenId,
      vault.paypalCustomerId,
      vault.payerEmail,
      vault.status,
      vault.createdAt,
      vault.updatedAt,
    ],
  );
}

function mapAgent(row: SqlRow): Agent {
  const allowed = text(row, "allowed_categories")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (!isCategory(part)) throw new Error(`Unknown category ${part}`);
      return part;
    });
  return {
    id: text(row, "id"),
    ownerId: text(row, "owner_id"),
    name: text(row, "name"),
    provider: text(row, "provider"),
    description: text(row, "description"),
    apiKeyPrefix: text(row, "api_key_prefix"),
    allowanceCents: integer(row, "allowance_cents"),
    status: text(row, "status") as AgentStatus,
    allowedCategories: allowed,
    perTxnCapCents: integer(row, "per_txn_cap_cents"),
    dailyCapCents: integer(row, "daily_cap_cents"),
    approvalThresholdCents: integer(row, "approval_threshold_cents"),
    trustedMerchantsOnly: flag(row, "trusted_merchants_only"),
    policyText: nullableText(row, "policy_text"),
    policySource: nullableText(row, "policy_source"),
    createdAt: text(row, "created_at"),
  };
}

export async function insertAgent(sql: Sql, agent: Agent, apiKey: string): Promise<void> {
  await sql.exec(
    `INSERT INTO agents (
      id, owner_id, name, provider, description, api_key_hash, api_key_prefix, allowance_cents, status,
      allowed_categories, per_txn_cap_cents, daily_cap_cents, approval_threshold_cents, trusted_merchants_only,
      policy_text, policy_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.ownerId,
      agent.name,
      agent.provider,
      agent.description,
      hashApiKey(apiKey),
      agent.apiKeyPrefix,
      agent.allowanceCents,
      agent.status,
      agent.allowedCategories.join(","),
      agent.perTxnCapCents,
      agent.dailyCapCents,
      agent.approvalThresholdCents,
      agent.trustedMerchantsOnly ? 1 : 0,
      agent.policyText,
      agent.policySource,
      agent.createdAt,
    ],
  );
}

export async function getAgent(sql: Sql, id: string): Promise<Agent | undefined> {
  const row = await sql.get("SELECT * FROM agents WHERE id = ?", [id]);
  return row ? mapAgent(row) : undefined;
}

export async function getAgentByApiKey(sql: Sql, apiKey: string): Promise<Agent | undefined> {
  const row = await sql.get("SELECT * FROM agents WHERE api_key_hash = ?", [hashApiKey(apiKey)]);
  return row ? mapAgent(row) : undefined;
}

export async function listAgents(sql: Sql, ownerId: string): Promise<Agent[]> {
  const rows = await sql.all("SELECT * FROM agents WHERE owner_id = ? ORDER BY name ASC", [ownerId]);
  return rows.map(mapAgent);
}

export async function listAllAgents(sql: Sql): Promise<Agent[]> {
  const rows = await sql.all("SELECT * FROM agents ORDER BY name ASC");
  return rows.map(mapAgent);
}

export async function setAgentStatus(sql: Sql, id: string, status: AgentStatus): Promise<void> {
  await sql.exec("UPDATE agents SET status = ? WHERE id = ?", [status, id]);
}

export async function addAllowance(sql: Sql, id: string, amountCents: number): Promise<void> {
  await sql.exec("UPDATE agents SET allowance_cents = allowance_cents + ? WHERE id = ?", [amountCents, id]);
}

export async function saveAgentPolicy(
  sql: Sql,
  id: string,
  policy: {
    perTxnCapCents: number;
    dailyCapCents: number;
    approvalThresholdCents: number;
    allowedCategories: Category[];
    trustedMerchantsOnly: boolean;
    policyText: string;
    policySource: string;
  },
): Promise<void> {
  await sql.exec(
    `UPDATE agents SET per_txn_cap_cents = ?, daily_cap_cents = ?, approval_threshold_cents = ?,
      allowed_categories = ?, trusted_merchants_only = ?, policy_text = ?, policy_source = ? WHERE id = ?`,
    [
      policy.perTxnCapCents,
      policy.dailyCapCents,
      policy.approvalThresholdCents,
      policy.allowedCategories.join(","),
      policy.trustedMerchantsOnly ? 1 : 0,
      policy.policyText,
      policy.policySource,
      id,
    ],
  );
}

function mapMerchant(row: SqlRow): Merchant {
  const category = text(row, "category");
  if (!isCategory(category)) throw new Error(`Unknown category ${category}`);
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    category,
    trusted: flag(row, "trusted"),
    blocked: flag(row, "blocked"),
    paypalEmail: text(row, "paypal_email"),
  };
}

export async function upsertMerchant(sql: Sql, merchant: Merchant): Promise<void> {
  await sql.exec(
    `INSERT INTO merchants (id, name, category, trusted, blocked, paypal_email) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET category = excluded.category, trusted = excluded.trusted,
       blocked = excluded.blocked, paypal_email = excluded.paypal_email`,
    [merchant.id, merchant.name, merchant.category, merchant.trusted ? 1 : 0, merchant.blocked ? 1 : 0, merchant.paypalEmail],
  );
}

export async function listMerchants(sql: Sql): Promise<Merchant[]> {
  return (await sql.all("SELECT * FROM merchants ORDER BY name ASC")).map(mapMerchant);
}

export async function searchMerchants(sql: Sql, query: string): Promise<Merchant[]> {
  const needle = `%${query.trim().toLowerCase()}%`;
  return (
    await sql.all(
      "SELECT * FROM merchants WHERE lower(name) LIKE ? OR lower(category) LIKE ? ORDER BY name ASC",
      [needle, needle],
    )
  ).map(mapMerchant);
}

export async function findMerchantByName(sql: Sql, name: string): Promise<Merchant | undefined> {
  const row = await sql.get("SELECT * FROM merchants WHERE lower(name) = lower(?)", [name]);
  return row ? mapMerchant(row) : undefined;
}

function mapIntent(row: SqlRow): IntentRecord {
  const category = nullableText(row, "category");
  return {
    id: text(row, "id"),
    agentId: text(row, "agent_id"),
    ownerId: text(row, "owner_id"),
    originalTask: text(row, "original_task"),
    rawText: text(row, "raw_text"),
    pageExcerpt: nullableText(row, "page_excerpt"),
    merchantName: nullableText(row, "merchant_name"),
    merchantEmail: nullableText(row, "merchant_email"),
    amountCents: nullableInteger(row, "amount_cents"),
    currency: nullableText(row, "currency"),
    category: category && isCategory(category) ? category : null,
    purpose: nullableText(row, "purpose"),
    confidence: row.confidence == null ? null : Number(row.confidence),
    guardDecision: nullableText(row, "guard_decision") as IntentRecord["guardDecision"],
    guardReasons: hits(text(row, "guard_reasons")),
    decision: nullableText(row, "decision") as Decision | null,
    decisionReasons: hits(text(row, "decision_reasons")),
    explanation: nullableText(row, "explanation"),
    status: text(row, "status") as IntentStatus,
    paypalOrderId: nullableText(row, "paypal_order_id"),
    captureId: nullableText(row, "capture_id"),
    approvalMethod: nullableText(row, "approval_method"),
    quoteId: nullableText(row, "quote_id"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export interface NewIntent {
  id: string;
  agentId: string;
  ownerId: string;
  originalTask: string;
  rawText: string;
  pageExcerpt: string | null;
  merchantName: string | null;
  merchantEmail: string | null;
  amountCents: number | null;
  currency: string | null;
  category: Category | null;
  purpose: string | null;
  confidence: number | null;
  guardDecision: "pass" | "block" | null;
  guardReasons: RuleHit[];
  decision: Decision | null;
  decisionReasons: RuleHit[];
  explanation: string | null;
  status: IntentStatus;
  paypalOrderId: string | null;
  captureId: string | null;
  approvalMethod: string | null;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function insertIntent(sql: Sql, intent: NewIntent): Promise<void> {
  await sql.exec(
    `INSERT INTO intents (
      id, agent_id, owner_id, original_task, raw_text, page_excerpt, merchant_name, merchant_email,
      amount_cents, currency, category, purpose, confidence, guard_decision, guard_reasons, decision,
      decision_reasons, explanation, status, paypal_order_id, capture_id, approval_method, quote_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      intent.id,
      intent.agentId,
      intent.ownerId,
      intent.originalTask,
      intent.rawText,
      intent.pageExcerpt,
      intent.merchantName,
      intent.merchantEmail,
      intent.amountCents,
      intent.currency,
      intent.category,
      intent.purpose,
      intent.confidence,
      intent.guardDecision,
      JSON.stringify(intent.guardReasons),
      intent.decision,
      JSON.stringify(intent.decisionReasons),
      intent.explanation,
      intent.status,
      intent.paypalOrderId,
      intent.captureId,
      intent.approvalMethod,
      intent.quoteId,
      intent.createdAt,
      intent.updatedAt,
    ],
  );
}

export async function getIntent(sql: Sql, id: string): Promise<IntentRecord | undefined> {
  const row = await sql.get("SELECT * FROM intents WHERE id = ?", [id]);
  return row ? mapIntent(row) : undefined;
}

export async function listIntents(sql: Sql, ownerId: string): Promise<IntentRecord[]> {
  return (await sql.all("SELECT * FROM intents WHERE owner_id = ? ORDER BY created_at DESC", [ownerId])).map(mapIntent);
}

export async function updateIntent(
  sql: Sql,
  id: string,
  patch: Partial<Pick<IntentRecord, "status" | "paypalOrderId" | "captureId" | "explanation" | "decision" | "approvalMethod">> & {
    updatedAt: string;
  },
): Promise<void> {
  const current = await getIntent(sql, id);
  if (!current) throw new Error(`Unknown intent ${id}`);
  const next = { ...current, ...patch };
  await sql.exec(
    `UPDATE intents SET status = ?, paypal_order_id = ?, capture_id = ?, explanation = ?, decision = ?, approval_method = ?, updated_at = ? WHERE id = ?`,
    [next.status, next.paypalOrderId, next.captureId, next.explanation, next.decision, next.approvalMethod, next.updatedAt, id],
  );
}

function mapReceipt(row: SqlRow): Receipt {
  return {
    id: text(row, "id"),
    intentId: text(row, "intent_id"),
    agentId: text(row, "agent_id"),
    ownerId: text(row, "owner_id"),
    kind: text(row, "kind") as Receipt["kind"],
    amountCents: integer(row, "amount_cents"),
    currency: text(row, "currency"),
    merchantName: text(row, "merchant_name"),
    paypalOrderId: nullableText(row, "paypal_order_id"),
    captureId: nullableText(row, "capture_id"),
    refundId: nullableText(row, "refund_id"),
    customId: text(row, "custom_id"),
    webhookEventId: nullableText(row, "webhook_event_id"),
    detail: text(row, "detail"),
    createdAt: text(row, "created_at"),
  };
}

export async function insertReceipt(sql: Sql, receipt: Receipt): Promise<void> {
  await sql.exec(
    `INSERT INTO receipts (
      id, intent_id, agent_id, owner_id, kind, amount_cents, currency, merchant_name, paypal_order_id,
      capture_id, refund_id, custom_id, webhook_event_id, detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receipt.id,
      receipt.intentId,
      receipt.agentId,
      receipt.ownerId,
      receipt.kind,
      receipt.amountCents,
      receipt.currency,
      receipt.merchantName,
      receipt.paypalOrderId,
      receipt.captureId,
      receipt.refundId,
      receipt.customId,
      receipt.webhookEventId,
      receipt.detail,
      receipt.createdAt,
    ],
  );
}

export async function listReceipts(sql: Sql, ownerId: string, agentId?: string): Promise<Receipt[]> {
  if (agentId) {
    return (await sql.all("SELECT * FROM receipts WHERE agent_id = ? ORDER BY created_at DESC", [agentId])).map(mapReceipt);
  }
  return (await sql.all("SELECT * FROM receipts WHERE owner_id = ? ORDER BY created_at DESC", [ownerId])).map(mapReceipt);
}

export async function receiptForCapture(sql: Sql, captureId: string, kind: Receipt["kind"]): Promise<Receipt | undefined> {
  const row = await sql.get("SELECT * FROM receipts WHERE capture_id = ? AND kind = ? LIMIT 1", [captureId, kind]);
  return row ? mapReceipt(row) : undefined;
}

export async function netSpentCents(sql: Sql, agentId: string): Promise<number> {
  const row = await sql.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents WHEN kind = 'refund' THEN -amount_cents ELSE 0 END), 0) AS spent
     FROM receipts WHERE agent_id = ?`,
    [agentId],
  );
  return row ? integer(row, "spent") : 0;
}

export async function spentSince(sql: Sql, agentId: string, since: string): Promise<number> {
  const row = await sql.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents WHEN kind = 'refund' THEN -amount_cents ELSE 0 END), 0) AS spent
     FROM receipts WHERE agent_id = ? AND created_at >= ?`,
    [agentId, since],
  );
  return row ? integer(row, "spent") : 0;
}

export async function insertApproval(sql: Sql, approval: Approval): Promise<void> {
  await sql.exec(
    `INSERT INTO approvals (id, intent_id, decision, method, note, webauthn_verified, decided_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      approval.id,
      approval.spendRequestId,
      approval.decision,
      null,
      approval.note,
      0,
      approval.decidedAt,
      approval.createdAt,
    ],
  );
}

export async function latestApproval(sql: Sql, intentId: string): Promise<Approval | undefined> {
  const row = await sql.get("SELECT * FROM approvals WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1", [intentId]);
  if (!row) return undefined;
  return {
    id: text(row, "id"),
    spendRequestId: text(row, "intent_id"),
    decision: text(row, "decision") as Approval["decision"],
    note: nullableText(row, "note"),
    decidedAt: nullableText(row, "decided_at"),
    createdAt: text(row, "created_at"),
  };
}

export async function markApproval(
  sql: Sql,
  id: string,
  decision: "approved" | "denied",
  note: string | null,
  method: string | null,
  webauthnVerified: boolean,
  decidedAt: string,
): Promise<void> {
  await sql.exec(
    "UPDATE approvals SET decision = ?, note = ?, method = ?, webauthn_verified = ?, decided_at = ? WHERE id = ?",
    [decision, note, method, webauthnVerified ? 1 : 0, decidedAt, id],
  );
}

export async function approvalVerified(sql: Sql, intentId: string): Promise<boolean> {
  const row = await sql.get(
    "SELECT webauthn_verified AS v FROM approvals WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1",
    [intentId],
  );
  return row ? flag(row, "v") : false;
}

export async function insertAudit(sql: Sql, event: Omit<AuditEvent, "purseId"> & { ownerId: string | null }): Promise<void> {
  await sql.exec(
    `INSERT INTO audit_events (id, owner_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [event.id, event.ownerId, event.actor, event.action, event.detail, event.createdAt],
  );
}

export async function listAudit(sql: Sql, ownerId: string): Promise<Array<AuditEvent & { ownerId: string | null }>> {
  const rows = await sql.all("SELECT * FROM audit_events WHERE owner_id = ? ORDER BY created_at DESC", [ownerId]);
  return rows.map((row) => ({
    id: text(row, "id"),
    purseId: nullableText(row, "owner_id") ?? "",
    ownerId: nullableText(row, "owner_id"),
    actor: text(row, "actor"),
    action: text(row, "action"),
    detail: text(row, "detail"),
    createdAt: text(row, "created_at"),
  }));
}

export interface PaypalOrderRecord {
  id: string;
  ownerId: string | null;
  intentId: string | null;
  kind: string;
  status: string;
  currency: string;
  amountCents: number;
  captureId: string | null;
  vaultId: string | null;
  payeeEmail: string | null;
  customId: string | null;
  rawJson: string;
  createdAt: string;
  updatedAt: string;
}

export async function upsertPaypalOrder(sql: Sql, order: PaypalOrderRecord): Promise<void> {
  await sql.exec(
    `INSERT INTO paypal_orders (
      id, owner_id, intent_id, kind, status, currency, amount_cents, capture_id, vault_id, payee_email, custom_id, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, capture_id = excluded.capture_id, raw_json = excluded.raw_json, updated_at = excluded.updated_at`,
    [
      order.id,
      order.ownerId,
      order.intentId,
      order.kind,
      order.status,
      order.currency,
      order.amountCents,
      order.captureId,
      order.vaultId,
      order.payeeEmail,
      order.customId,
      order.rawJson,
      order.createdAt,
      order.updatedAt,
    ],
  );
}

function mapOrder(row: SqlRow): PaypalOrderRecord {
  return {
    id: text(row, "id"),
    ownerId: nullableText(row, "owner_id"),
    intentId: nullableText(row, "intent_id"),
    kind: text(row, "kind"),
    status: text(row, "status"),
    currency: text(row, "currency"),
    amountCents: integer(row, "amount_cents"),
    captureId: nullableText(row, "capture_id"),
    vaultId: nullableText(row, "vault_id"),
    payeeEmail: nullableText(row, "payee_email"),
    customId: nullableText(row, "custom_id"),
    rawJson: text(row, "raw_json"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export async function getPaypalOrder(sql: Sql, id: string): Promise<PaypalOrderRecord | undefined> {
  const row = await sql.get("SELECT * FROM paypal_orders WHERE id = ?", [id]);
  return row ? mapOrder(row) : undefined;
}

export async function getPaypalOrderByCapture(sql: Sql, captureId: string): Promise<PaypalOrderRecord | undefined> {
  const row = await sql.get("SELECT * FROM paypal_orders WHERE capture_id = ?", [captureId]);
  return row ? mapOrder(row) : undefined;
}

export async function getPaypalOrderByCustomId(sql: Sql, customId: string): Promise<PaypalOrderRecord | undefined> {
  const row = await sql.get("SELECT * FROM paypal_orders WHERE custom_id = ? ORDER BY created_at DESC LIMIT 1", [customId]);
  return row ? mapOrder(row) : undefined;
}

export async function recordPaypalEvent(
  sql: Sql,
  event: { id: string; transmissionId: string | null; eventType: string; resourceId: string | null; intentId: string | null; verified: boolean; rawJson: string; createdAt: string },
): Promise<boolean> {
  if (event.transmissionId) {
    const existing = await sql.get("SELECT id FROM paypal_events WHERE transmission_id = ?", [event.transmissionId]);
    if (existing) return false;
  }
  await sql.exec(
    `INSERT INTO paypal_events (id, transmission_id, event_type, resource_id, intent_id, verified, raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.id, event.transmissionId, event.eventType, event.resourceId, event.intentId, event.verified ? 1 : 0, event.rawJson, event.createdAt],
  );
  return true;
}

export async function insertQuote(
  sql: Sql,
  quote: {
    id: string;
    agentId: string;
    merchantName: string;
    merchantEmail: string;
    category: string;
    amountCents: number;
    currency: string;
    description: string;
    originalTask: string;
    pageExcerpt: string | null;
    expiresAt: string;
    createdAt: string;
  },
): Promise<void> {
  await sql.exec(
    `INSERT INTO quotes (
      id, agent_id, merchant_name, merchant_email, category, amount_cents, currency, description, original_task, page_excerpt, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quote.id,
      quote.agentId,
      quote.merchantName,
      quote.merchantEmail,
      quote.category,
      quote.amountCents,
      quote.currency,
      quote.description,
      quote.originalTask,
      quote.pageExcerpt,
      quote.expiresAt,
      quote.createdAt,
    ],
  );
}

export async function getQuote(sql: Sql, id: string): Promise<SqlRow | undefined> {
  return sql.get("SELECT * FROM quotes WHERE id = ?", [id]);
}

export async function insertNotification(
  sql: Sql,
  note: { id: string; ownerId: string; intentId: string | null; title: string; body: string; delivered: boolean; createdAt: string },
): Promise<void> {
  await sql.exec(
    `INSERT INTO notifications (id, owner_id, intent_id, title, body, delivered, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [note.id, note.ownerId, note.intentId, note.title, note.body, note.delivered ? 1 : 0, note.createdAt],
  );
}

export async function listNotifications(sql: Sql, ownerId: string): Promise<SqlRow[]> {
  return sql.all("SELECT * FROM notifications WHERE owner_id = ? ORDER BY created_at DESC", [ownerId]);
}

export async function savePushSubscription(
  sql: Sql,
  sub: { id: string; ownerId: string; endpoint: string; p256dh: string; authKey: string; createdAt: string },
): Promise<void> {
  await sql.exec(
    `INSERT INTO push_subscriptions (id, owner_id, endpoint, p256dh, auth_key, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth_key = excluded.auth_key`,
    [sub.id, sub.ownerId, sub.endpoint, sub.p256dh, sub.authKey, sub.createdAt],
  );
}

export async function listPushSubscriptions(sql: Sql, ownerId: string): Promise<SqlRow[]> {
  return sql.all("SELECT * FROM push_subscriptions WHERE owner_id = ?", [ownerId]);
}

export async function saveChallenge(
  sql: Sql,
  row: { id: string; ownerId: string; intentId: string | null; challenge: string; kind: string; expiresAt: string; createdAt: string },
): Promise<void> {
  await sql.exec(
    `INSERT INTO webauthn_challenges (id, owner_id, intent_id, challenge, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.ownerId, row.intentId, row.challenge, row.kind, row.expiresAt, row.createdAt],
  );
}

export async function takeChallenge(sql: Sql, ownerId: string, kind: string): Promise<SqlRow | undefined> {
  return sql.get(
    "SELECT * FROM webauthn_challenges WHERE owner_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1",
    [ownerId, kind],
  );
}

export async function saveCredential(
  sql: Sql,
  row: { id: string; ownerId: string; credentialId: string; publicKey: string; counter: number; transports: string | null; deviceType: string | null; backedUp: boolean; createdAt: string },
): Promise<void> {
  await sql.exec(
    `INSERT INTO webauthn_credentials (id, owner_id, credential_id, public_key, counter, transports, device_type, backed_up, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.ownerId, row.credentialId, row.publicKey, row.counter, row.transports, row.deviceType, row.backedUp ? 1 : 0, row.createdAt],
  );
}

export async function listCredentials(sql: Sql, ownerId: string): Promise<SqlRow[]> {
  return sql.all("SELECT * FROM webauthn_credentials WHERE owner_id = ?", [ownerId]);
}

export async function getCredential(sql: Sql, credentialId: string): Promise<SqlRow | undefined> {
  return sql.get("SELECT * FROM webauthn_credentials WHERE credential_id = ?", [credentialId]);
}

export async function setCredentialCounter(sql: Sql, credentialId: string, counter: number): Promise<void> {
  await sql.exec("UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?", [counter, credentialId]);
}

export type { SqlValue };
