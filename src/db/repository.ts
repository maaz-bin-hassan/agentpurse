import type { DatabaseSync } from "node:sqlite";
import { periodStart } from "@/src/domain/period";
import {
  isCategory,
  isPeriod,
  type Agent,
  type AgentStatus,
  type Approval,
  type AuditEvent,
  type Category,
  type Decision,
  type Envelope,
  type Merchant,
  type PaypalOrderRecord,
  type Period,
  type Purse,
  type RuleHit,
  type SpendRequest,
  type SpendStatus,
} from "@/src/domain/types";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected text in ${key}`);
  return value;
}

function nullableText(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`Expected text in ${key}`);
  return value;
}

function integer(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Expected integer in ${key}`);
  }
  return value;
}

function nullableInteger(row: Row, key: string): number | null {
  const value = row[key];
  if (value == null) return null;
  return integer(row, key);
}

function flag(row: Row, key: string): boolean {
  return integer(row, key) === 1;
}

function categoryOf(value: string, field: string): Category {
  if (!isCategory(value)) throw new Error(`Unknown category ${value} in ${field}`);
  return value;
}

function mapPurse(row: Row): Purse {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    ownerName: text(row, "owner_name"),
    currency: text(row, "currency"),
    balanceCents: integer(row, "balance_cents"),
    perTxnCapCents: integer(row, "per_txn_cap_cents"),
    dailyCapCents: integer(row, "daily_cap_cents"),
    approvalThresholdCents: integer(row, "approval_threshold_cents"),
    createdAt: text(row, "created_at"),
  };
}

function mapEnvelope(row: Row): Envelope {
  const period = text(row, "period");
  if (!isPeriod(period)) throw new Error(`Unknown period ${period}`);
  return {
    id: text(row, "id"),
    purseId: text(row, "purse_id"),
    name: text(row, "name"),
    category: categoryOf(text(row, "category"), "envelopes.category"),
    limitCents: integer(row, "limit_cents"),
    period,
    createdAt: text(row, "created_at"),
  };
}

function mapAgent(row: Row): Agent {
  const status = text(row, "status");
  if (status !== "active" && status !== "paused") throw new Error(`Unknown agent status ${status}`);
  const allowedCategories = text(row, "allowed_categories")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => categoryOf(part, "agents.allowed_categories"));
  return {
    id: text(row, "id"),
    purseId: text(row, "purse_id"),
    name: text(row, "name"),
    description: text(row, "description"),
    allowedCategories,
    status,
    createdAt: text(row, "created_at"),
  };
}

function mapMerchant(row: Row): Merchant {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    category: categoryOf(text(row, "category"), "merchants.category"),
    trusted: flag(row, "trusted"),
    blocked: flag(row, "blocked"),
  };
}

function mapReasons(raw: string): RuleHit[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.code !== "string" || typeof record.sentence !== "string") return [];
    return [{ code: record.code, sentence: record.sentence }];
  });
}

function mapSpend(row: Row): SpendRequest {
  const decision = nullableText(row, "decision");
  const category = nullableText(row, "category");
  return {
    id: text(row, "id"),
    purseId: text(row, "purse_id"),
    agentId: text(row, "agent_id"),
    envelopeId: nullableText(row, "envelope_id"),
    rawText: text(row, "raw_text"),
    merchantName: nullableText(row, "merchant_name"),
    amountCents: nullableInteger(row, "amount_cents"),
    currency: nullableText(row, "currency"),
    category: category ? categoryOf(category, "spend_requests.category") : null,
    purpose: nullableText(row, "purpose"),
    confidence: row.confidence == null ? null : Number(row.confidence),
    decision: decision as Decision | null,
    decisionReasons: mapReasons(text(row, "decision_reasons")),
    explanation: nullableText(row, "explanation"),
    status: text(row, "status") as SpendStatus,
    paypalOrderId: nullableText(row, "paypal_order_id"),
    captureId: nullableText(row, "capture_id"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function mapApproval(row: Row): Approval {
  return {
    id: text(row, "id"),
    spendRequestId: text(row, "spend_request_id"),
    decision: text(row, "decision") as Approval["decision"],
    note: nullableText(row, "note"),
    decidedAt: nullableText(row, "decided_at"),
    createdAt: text(row, "created_at"),
  };
}

function mapAudit(row: Row): AuditEvent {
  return {
    id: text(row, "id"),
    purseId: nullableText(row, "purse_id"),
    actor: text(row, "actor"),
    action: text(row, "action"),
    detail: text(row, "detail"),
    createdAt: text(row, "created_at"),
  };
}

function mapPaypal(row: Row): PaypalOrderRecord {
  return {
    id: text(row, "id"),
    purseId: nullableText(row, "purse_id"),
    spendRequestId: nullableText(row, "spend_request_id"),
    kind: text(row, "kind") as PaypalOrderRecord["kind"],
    status: text(row, "status"),
    currency: text(row, "currency"),
    amountCents: integer(row, "amount_cents"),
    captureId: nullableText(row, "capture_id"),
    customId: nullableText(row, "custom_id"),
    rawJson: text(row, "raw_json"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function one(db: DatabaseSync, sql: string, ...params: Array<string | number | null>): Row | undefined {
  const row = db.prepare(sql).get(...params) as Row | undefined;
  return row;
}

function many(db: DatabaseSync, sql: string, ...params: Array<string | number | null>): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

export function countPurses(db: DatabaseSync): number {
  const row = one(db, "SELECT COUNT(*) AS n FROM purses");
  return row ? integer(row, "n") : 0;
}

export function listPurses(db: DatabaseSync): Purse[] {
  return many(db, "SELECT * FROM purses ORDER BY created_at ASC").map(mapPurse);
}

export function getPurse(db: DatabaseSync, id: string): Purse | undefined {
  const row = one(db, "SELECT * FROM purses WHERE id = ?", id);
  return row ? mapPurse(row) : undefined;
}

export function insertPurse(db: DatabaseSync, purse: Purse): void {
  db.prepare(
    `INSERT INTO purses (
      id, name, owner_name, currency, balance_cents, per_txn_cap_cents,
      daily_cap_cents, approval_threshold_cents, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    purse.id,
    purse.name,
    purse.ownerName,
    purse.currency,
    purse.balanceCents,
    purse.perTxnCapCents,
    purse.dailyCapCents,
    purse.approvalThresholdCents,
    purse.createdAt,
  );
}

export function setBalance(db: DatabaseSync, purseId: string, balanceCents: number): void {
  db.prepare("UPDATE purses SET balance_cents = ? WHERE id = ?").run(balanceCents, purseId);
}

export function insertEnvelope(db: DatabaseSync, envelope: Envelope): void {
  db.prepare(
    `INSERT INTO envelopes (id, purse_id, name, category, limit_cents, period, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    envelope.id,
    envelope.purseId,
    envelope.name,
    envelope.category,
    envelope.limitCents,
    envelope.period,
    envelope.createdAt,
  );
}

export function listEnvelopes(db: DatabaseSync, purseId: string): Envelope[] {
  return many(db, "SELECT * FROM envelopes WHERE purse_id = ? ORDER BY name ASC", purseId).map(mapEnvelope);
}

export function envelopeSpentCents(
  db: DatabaseSync,
  envelopeId: string,
  period: Period,
  now: Date,
): number {
  const row = one(
    db,
    `SELECT COALESCE(SUM(amount_cents), 0) AS spent
     FROM spend_requests
     WHERE envelope_id = ? AND status = 'captured' AND created_at >= ?`,
    envelopeId,
    periodStart(period, now),
  );
  return row ? integer(row, "spent") : 0;
}

export function dailySpentCents(db: DatabaseSync, purseId: string, now: Date): number {
  const row = one(
    db,
    `SELECT COALESCE(SUM(amount_cents), 0) AS spent
     FROM spend_requests
     WHERE purse_id = ? AND status = 'captured' AND created_at >= ?`,
    purseId,
    periodStart("daily", now),
  );
  return row ? integer(row, "spent") : 0;
}

export function insertAgent(
  db: DatabaseSync,
  agent: Omit<Agent, "allowedCategories"> & { allowedCategories: Category[] },
): void {
  db.prepare(
    `INSERT INTO agents (id, purse_id, name, description, allowed_categories, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    agent.id,
    agent.purseId,
    agent.name,
    agent.description,
    agent.allowedCategories.join(","),
    agent.status satisfies AgentStatus,
    agent.createdAt,
  );
}

export function listAgents(db: DatabaseSync, purseId: string): Agent[] {
  return many(db, "SELECT * FROM agents WHERE purse_id = ? ORDER BY name ASC", purseId).map(mapAgent);
}

export function getAgent(db: DatabaseSync, id: string): Agent | undefined {
  const row = one(db, "SELECT * FROM agents WHERE id = ?", id);
  return row ? mapAgent(row) : undefined;
}

export function upsertMerchant(db: DatabaseSync, merchant: Merchant): void {
  db.prepare(
    `INSERT INTO merchants (id, name, category, trusted, blocked)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       category = excluded.category,
       trusted = excluded.trusted,
       blocked = excluded.blocked`,
  ).run(merchant.id, merchant.name, merchant.category, merchant.trusted ? 1 : 0, merchant.blocked ? 1 : 0);
}

export function listMerchants(db: DatabaseSync): Merchant[] {
  return many(db, "SELECT * FROM merchants ORDER BY name ASC").map(mapMerchant);
}

export function findMerchantByName(db: DatabaseSync, name: string): Merchant | undefined {
  const row = one(db, "SELECT * FROM merchants WHERE name = ? COLLATE NOCASE", name);
  return row ? mapMerchant(row) : undefined;
}

export interface NewSpend {
  id: string;
  purseId: string;
  agentId: string;
  envelopeId: string | null;
  rawText: string;
  merchantName: string | null;
  amountCents: number | null;
  currency: string | null;
  category: Category | null;
  purpose: string | null;
  confidence: number | null;
  decision: Decision | null;
  decisionReasons: RuleHit[];
  explanation: string | null;
  status: SpendStatus;
  paypalOrderId: string | null;
  captureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function insertSpend(db: DatabaseSync, spend: NewSpend): void {
  db.prepare(
    `INSERT INTO spend_requests (
      id, purse_id, agent_id, envelope_id, raw_text, merchant_name, amount_cents, currency,
      category, purpose, confidence, decision, decision_reasons, explanation, status,
      paypal_order_id, capture_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    spend.id,
    spend.purseId,
    spend.agentId,
    spend.envelopeId,
    spend.rawText,
    spend.merchantName,
    spend.amountCents,
    spend.currency,
    spend.category,
    spend.purpose,
    spend.confidence,
    spend.decision,
    JSON.stringify(spend.decisionReasons),
    spend.explanation,
    spend.status,
    spend.paypalOrderId,
    spend.captureId,
    spend.createdAt,
    spend.updatedAt,
  );
}

export function getSpend(db: DatabaseSync, id: string): SpendRequest | undefined {
  const row = one(db, "SELECT * FROM spend_requests WHERE id = ?", id);
  return row ? mapSpend(row) : undefined;
}

export function listSpends(db: DatabaseSync, purseId: string): SpendRequest[] {
  return many(
    db,
    "SELECT * FROM spend_requests WHERE purse_id = ? ORDER BY created_at DESC",
    purseId,
  ).map(mapSpend);
}

export function updateSpend(
  db: DatabaseSync,
  id: string,
  patch: Partial<Pick<SpendRequest, "status" | "paypalOrderId" | "captureId" | "explanation" | "decision">> & {
    updatedAt: string;
  },
): void {
  const current = getSpend(db, id);
  if (!current) throw new Error(`Unknown spend ${id}`);
  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE spend_requests
     SET status = ?, paypal_order_id = ?, capture_id = ?, explanation = ?, decision = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.status, next.paypalOrderId, next.captureId, next.explanation, next.decision, next.updatedAt, id);
}

export function insertApproval(db: DatabaseSync, approval: Approval): void {
  db.prepare(
    `INSERT INTO approvals (id, spend_request_id, decision, note, decided_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    approval.id,
    approval.spendRequestId,
    approval.decision,
    approval.note,
    approval.decidedAt,
    approval.createdAt,
  );
}

export function latestApproval(db: DatabaseSync, spendRequestId: string): Approval | undefined {
  const row = one(
    db,
    "SELECT * FROM approvals WHERE spend_request_id = ? ORDER BY created_at DESC LIMIT 1",
    spendRequestId,
  );
  return row ? mapApproval(row) : undefined;
}

export function decideApproval(
  db: DatabaseSync,
  id: string,
  decision: "approved" | "denied",
  note: string | null,
  decidedAt: string,
): void {
  db.prepare("UPDATE approvals SET decision = ?, note = ?, decided_at = ? WHERE id = ?").run(
    decision,
    note,
    decidedAt,
    id,
  );
}

export function insertAudit(db: DatabaseSync, event: AuditEvent): void {
  db.prepare(
    `INSERT INTO audit_events (id, purse_id, actor, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(event.id, event.purseId, event.actor, event.action, event.detail, event.createdAt);
}

export function listAudit(db: DatabaseSync, purseId: string): AuditEvent[] {
  return many(
    db,
    "SELECT * FROM audit_events WHERE purse_id = ? ORDER BY created_at DESC",
    purseId,
  ).map(mapAudit);
}

export function upsertPaypalOrder(db: DatabaseSync, order: PaypalOrderRecord): void {
  db.prepare(
    `INSERT INTO paypal_orders (
      id, purse_id, spend_request_id, kind, status, currency, amount_cents, capture_id,
      custom_id, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      purse_id = excluded.purse_id,
      spend_request_id = excluded.spend_request_id,
      kind = excluded.kind,
      status = excluded.status,
      currency = excluded.currency,
      amount_cents = excluded.amount_cents,
      capture_id = excluded.capture_id,
      custom_id = excluded.custom_id,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at`,
  ).run(
    order.id,
    order.purseId,
    order.spendRequestId,
    order.kind,
    order.status,
    order.currency,
    order.amountCents,
    order.captureId,
    order.customId,
    order.rawJson,
    order.createdAt,
    order.updatedAt,
  );
}

export function getPaypalOrder(db: DatabaseSync, id: string): PaypalOrderRecord | undefined {
  const row = one(db, "SELECT * FROM paypal_orders WHERE id = ?", id);
  return row ? mapPaypal(row) : undefined;
}

export function getPaypalOrderByCapture(db: DatabaseSync, captureId: string): PaypalOrderRecord | undefined {
  const row = one(db, "SELECT * FROM paypal_orders WHERE capture_id = ?", captureId);
  return row ? mapPaypal(row) : undefined;
}

export function listPaypalOrders(db: DatabaseSync, purseId: string): PaypalOrderRecord[] {
  return many(
    db,
    "SELECT * FROM paypal_orders WHERE purse_id = ? ORDER BY created_at DESC",
    purseId,
  ).map(mapPaypal);
}
