import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { parseSpendIntent } from "@/src/ai/intent";
import { formatMoney } from "@/src/domain/money";
import type { Agent, Envelope, Merchant, Purse, SpendRequest } from "@/src/domain/types";
import {
  dailySpentCents,
  decideApproval,
  envelopeSpentCents,
  findMerchantByName,
  getAgent,
  getPurse,
  getSpend,
  insertApproval,
  insertAudit,
  insertSpend,
  latestApproval,
  listEnvelopes,
  listMerchants,
  setBalance,
  updateSpend,
  getPaypalOrder,
} from "@/src/db/repository";
import { transactionAsync } from "@/src/db/transaction";
import { evaluateSpend, type ClerkInput, type ClerkResult } from "@/src/policy/engine";
import type { AppEnv } from "@/src/config";
import { createPayPalClient, PayPalError, type PayPalClient, type PaypalOrder } from "@/src/paypal";
import { fail, type ActionResult } from "@/src/server/http";

export interface ActionOptions {
  now?: Date;
  env?: AppEnv;
  paypal?: PayPalClient;
}

function nid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function stamp(now: Date): string {
  return now.toISOString();
}

function clientFor(db: DatabaseSync, options?: ActionOptions): PayPalClient {
  return options?.paypal ?? createPayPalClient(db, options?.env ?? process.env);
}

function captureIdOf(order: PaypalOrder): string | null {
  return order.purchase_units[0]?.payments?.captures?.[0]?.id ?? null;
}

function buildClerkInput(input: {
  purse: Purse;
  agent: Agent;
  merchant: Merchant | undefined;
  merchantName: string | null;
  amountCents: number | null;
  currency: string | null;
  category: SpendRequest["category"];
  envelope: Envelope | undefined;
  envelopeSpent: number;
  dailySpent: number;
  intentComplete: boolean;
  humanApproved?: boolean;
}): ClerkInput {
  return {
    ownerName: input.purse.ownerName,
    agentName: input.agent.name,
    agentStatus: input.agent.status,
    samePurse: input.agent.purseId === input.purse.id,
    intentComplete: input.intentComplete,
    amountCents: input.amountCents,
    currency: input.currency,
    purseCurrency: input.purse.currency,
    merchantName: input.merchantName,
    merchantBlocked: input.merchant?.blocked ?? false,
    merchantTrusted: input.merchant ? input.merchant.trusted : false,
    category: input.category,
    categoryAllowed: input.category ? input.agent.allowedCategories.includes(input.category) : false,
    envelope: input.envelope
      ? {
          name: input.envelope.name,
          limitCents: input.envelope.limitCents,
          spentCents: input.envelopeSpent,
          period: input.envelope.period,
        }
      : null,
    perTxnCapCents: input.purse.perTxnCapCents,
    dailyCapCents: input.purse.dailyCapCents,
    dailySpentCents: input.dailySpent,
    balanceCents: input.purse.balanceCents,
    approvalThresholdCents: input.purse.approvalThresholdCents,
    humanApproved: input.humanApproved,
  };
}

async function settleSpend(
  db: DatabaseSync,
  paypal: PayPalClient,
  input: {
    purseId: string;
    spendId: string;
    amountCents: number;
    currency: string;
    description: string;
    explanation: string;
    actor: string;
    now: Date;
    insert?: Parameters<typeof insertSpend>[1];
    assertStillAllowed?: () => void;
  },
): Promise<PaypalOrder> {
  let capturedOrder: PaypalOrder | null = null;
  await transactionAsync(db, async () => {
    input.assertStillAllowed?.();
    const purse = getPurse(db, input.purseId);
    if (!purse) throw new PayPalError("Unknown purse.", 404);
    if (purse.balanceCents < input.amountCents) {
      throw new PayPalError(`The purse has ${formatMoney(purse.balanceCents, purse.currency)} available.`, 409);
    }
    const created = await paypal.createOrder({
      amountCents: input.amountCents,
      currency: input.currency,
      kind: "spend",
      purseId: purse.id,
      spendRequestId: input.spendId,
      customId: input.spendId,
      description: input.description,
    });
    const approved = await paypal.approveOrder(created.id);
    const captured = await paypal.captureOrder(approved.id);
    const captureId = captureIdOf(captured);
    if (!captureId) throw new PayPalError("PayPal capture did not return a capture id.");
    setBalance(db, purse.id, purse.balanceCents - input.amountCents);
    const at = stamp(input.now);
    if (input.insert) {
      insertSpend(db, {
        ...input.insert,
        status: "captured",
        decision: "allow",
        explanation: input.explanation,
        paypalOrderId: captured.id,
        captureId,
      });
    } else {
      updateSpend(db, input.spendId, {
        status: "captured",
        decision: "allow",
        explanation: input.explanation,
        paypalOrderId: captured.id,
        captureId,
        updatedAt: at,
      });
    }
    insertAudit(db, {
      id: nid("audit"),
      purseId: purse.id,
      actor: input.actor,
      action: "spend_captured",
      detail: input.explanation,
      createdAt: at,
    });
    capturedOrder = captured;
  });
  if (!capturedOrder) throw new PayPalError("PayPal capture did not complete.");
  return capturedOrder;
}

function recordDecision(
  db: DatabaseSync,
  spend: Parameters<typeof insertSpend>[1],
  actor: string,
  action: string,
): void {
  insertSpend(db, spend);
  if (spend.status === "pending_approval") {
    insertApproval(db, {
      id: nid("approval"),
      spendRequestId: spend.id,
      decision: "pending",
      note: null,
      decidedAt: null,
      createdAt: spend.createdAt,
    });
  }
  insertAudit(db, {
    id: nid("audit"),
    purseId: spend.purseId,
    actor,
    action,
    detail: spend.explanation ?? spend.rawText,
    createdAt: spend.createdAt,
  });
}

export async function submitSpend(
  db: DatabaseSync,
  agentId: string,
  text: string,
  options?: ActionOptions,
): Promise<
  ActionResult<
    | { ok: true; explanation: string; spend: SpendRequest; order: PaypalOrder | null }
    | { ok: false; error: string }
  >
> {
  const now = options?.now ?? new Date();
  const trimmed = text.trim();
  if (!trimmed) return fail(400, "Write the payment in a sentence.");
  const agent = getAgent(db, agentId);
  if (!agent) return fail(404, "Unknown agent.");
  const purse = getPurse(db, agent.purseId);
  if (!purse) return fail(404, "Unknown purse.");

  const intent = await parseSpendIntent(trimmed, {
    merchants: listMerchants(db),
    env: options?.env ?? process.env,
  });
  const merchant = intent.merchantName ? findMerchantByName(db, intent.merchantName) : undefined;
  const envelope = intent.category
    ? listEnvelopes(db, purse.id).find((item) => item.category === intent.category)
    : undefined;
  const clerk = evaluateSpend(
    buildClerkInput({
      purse,
      agent,
      merchant,
      merchantName: intent.merchantName,
      amountCents: intent.amountCents,
      currency: intent.currency,
      category: intent.category,
      envelope,
      envelopeSpent: envelope ? envelopeSpentCents(db, envelope.id, envelope.period, now) : 0,
      dailySpent: dailySpentCents(db, purse.id, now),
      intentComplete: intent.complete,
    }),
  );

  const at = stamp(now);
  const spendId = nid("spend");
  const draft = {
    id: spendId,
    purseId: purse.id,
    agentId: agent.id,
    envelopeId: envelope?.id ?? null,
    rawText: trimmed,
    merchantName: intent.merchantName,
    amountCents: intent.amountCents,
    currency: intent.currency,
    category: intent.category,
    purpose: intent.purpose,
    confidence: intent.confidence,
    decision: clerk.decision,
    decisionReasons: clerk.reasons,
    explanation: clerk.explanation,
    status: "denied" as const,
    paypalOrderId: null,
    captureId: null,
    createdAt: at,
    updatedAt: at,
  };

  if (clerk.decision === "allow" && intent.amountCents != null && intent.currency) {
    try {
      const order = await settleSpend(db, clientFor(db, options), {
        purseId: purse.id,
        spendId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        description: `${agent.name} pays ${intent.merchantName ?? "a merchant"}`,
        explanation: clerk.explanation,
        actor: agent.name.toLowerCase(),
        now,
        insert: draft,
        assertStillAllowed: () => {
          const fresh = getPurse(db, purse.id);
          if (!fresh) throw new PayPalError("Unknown purse.", 404);
          const again = evaluateSpend(
            buildClerkInput({
              purse: fresh,
              agent,
              merchant,
              merchantName: intent.merchantName,
              amountCents: intent.amountCents,
              currency: intent.currency,
              category: intent.category,
              envelope,
              envelopeSpent: envelope ? envelopeSpentCents(db, envelope.id, envelope.period, now) : 0,
              dailySpent: dailySpentCents(db, purse.id, now),
              intentComplete: true,
            }),
          );
          if (again.decision !== "allow") throw new PayPalError(`Still blocked. ${again.explanation}`, 409);
        },
      });
      const spend = getSpend(db, spendId);
      if (!spend) return fail(500, "The payment was captured but not recorded.");
      return { status: 200, body: { ok: true, explanation: spend.explanation ?? clerk.explanation, spend, order } };
    } catch (error) {
      if (error instanceof PayPalError) return fail(error.status, error.message);
      throw error;
    }
  }

  const status =
    clerk.decision === "deny"
      ? "denied"
      : clerk.decision === "needs_approval"
        ? "pending_approval"
        : "needs_clarification";
  recordDecision(
    db,
    { ...draft, status },
    clerk.decision === "deny" || clerk.decision === "needs_clarification" ? "clerk" : agent.name.toLowerCase(),
    `spend_${status}`,
  );
  const spend = getSpend(db, spendId);
  if (!spend) return fail(500, "The decision was not recorded.");
  return { status: 200, body: { ok: true, explanation: clerk.explanation, spend, order: null } };
}

function recheck(db: DatabaseSync, spend: SpendRequest, now: Date, humanApproved: boolean): ClerkResult | null {
  const agent = getAgent(db, spend.agentId);
  const purse = getPurse(db, spend.purseId);
  if (!agent || !purse || spend.amountCents == null || !spend.currency) return null;
  const envelopes = listEnvelopes(db, purse.id);
  const envelope = spend.envelopeId ? envelopes.find((item) => item.id === spend.envelopeId) : undefined;
  const merchant = spend.merchantName ? findMerchantByName(db, spend.merchantName) : undefined;
  return evaluateSpend(
    buildClerkInput({
      purse,
      agent,
      merchant,
      merchantName: spend.merchantName,
      amountCents: spend.amountCents,
      currency: spend.currency,
      category: spend.category,
      envelope,
      envelopeSpent: envelope ? envelopeSpentCents(db, envelope.id, envelope.period, now) : 0,
      dailySpent: dailySpentCents(db, purse.id, now),
      intentComplete: true,
      humanApproved,
    }),
  );
}

export async function approveSpend(
  db: DatabaseSync,
  spendId: string,
  note?: string,
  options?: ActionOptions,
): Promise<
  ActionResult<
    | { ok: true; explanation: string; spend: SpendRequest; order: PaypalOrder }
    | { ok: false; error: string }
  >
> {
  const now = options?.now ?? new Date();
  const spend = getSpend(db, spendId);
  if (!spend) return fail(404, "Unknown spend.");
  if (spend.status !== "pending_approval") return fail(409, "That request is not waiting for approval.");
  if (spend.amountCents == null || !spend.currency || !spend.merchantName) {
    return fail(409, "That request is missing an amount or a merchant.");
  }
  const clerk = recheck(db, spend, now, true);
  if (!clerk || clerk.decision !== "allow") {
    return fail(409, `Still blocked. ${clerk?.explanation ?? "The clerk could not re-check this request."}`);
  }
  const agent = getAgent(db, spend.agentId);
  try {
    const order = await settleSpend(db, clientFor(db, options), {
      purseId: spend.purseId,
      spendId: spend.id,
      amountCents: spend.amountCents,
      currency: spend.currency,
      description: `${agent?.name ?? "Agent"} pays ${spend.merchantName}`,
      explanation: clerk.explanation,
      actor: agent?.name.toLowerCase() ?? "agent",
      now,
      assertStillAllowed: () => {
        const again = recheck(db, spend, now, true);
        if (!again || again.decision !== "allow") {
          throw new PayPalError(`Still blocked. ${again?.explanation ?? "The clerk could not re-check this request."}`, 409);
        }
      },
    });
    const approval = latestApproval(db, spend.id);
    if (approval) decideApproval(db, approval.id, "approved", note?.trim() || null, stamp(now));
    const updated = getSpend(db, spend.id);
    if (!updated) return fail(500, "The approval was not recorded.");
    return { status: 200, body: { ok: true, explanation: updated.explanation ?? clerk.explanation, spend: updated, order } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function denySpend(
  db: DatabaseSync,
  spendId: string,
  note?: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; explanation: string; spend: SpendRequest } | { ok: false; error: string }>> {
  const now = options?.now ?? new Date();
  const spend = getSpend(db, spendId);
  if (!spend) return fail(404, "Unknown spend.");
  if (spend.status !== "pending_approval") return fail(409, "That request is not waiting for approval.");
  const purse = getPurse(db, spend.purseId);
  const trimmed = note?.trim();
  const explanation = trimmed
    ? `${purse?.ownerName ?? "The owner"} denied the hold. ${trimmed}`
    : `${purse?.ownerName ?? "The owner"} denied the hold.`;
  const at = stamp(now);
  updateSpend(db, spend.id, { status: "denied", decision: "deny", explanation, updatedAt: at });
  const approval = latestApproval(db, spend.id);
  if (approval) decideApproval(db, approval.id, "denied", trimmed || null, at);
  insertAudit(db, {
    id: nid("audit"),
    purseId: spend.purseId,
    actor: purse?.ownerName ?? "owner",
    action: "spend_denied",
    detail: explanation,
    createdAt: at,
  });
  const updated = getSpend(db, spend.id);
  if (!updated) return fail(500, "The denial was not recorded.");
  return { status: 200, body: { ok: true, explanation, spend: updated } };
}

export async function refundSpend(
  db: DatabaseSync,
  spendId: string,
  options?: ActionOptions,
): Promise<
  ActionResult<
    | { ok: true; explanation: string; spend: SpendRequest }
    | { ok: false; error: string }
  >
> {
  const now = options?.now ?? new Date();
  const spend = getSpend(db, spendId);
  if (!spend) return fail(404, "Unknown spend.");
  if (spend.status !== "captured" || !spend.captureId || spend.amountCents == null) {
    return fail(409, "Only a captured payment can be refunded.");
  }
  const paypal = clientFor(db, options);
  try {
    const explanation = `Refunded ${formatMoney(spend.amountCents, spend.currency ?? "USD")} to the purse.`;
    await transactionAsync(db, async () => {
      await paypal.refundCapture(spend.captureId!, spend.amountCents!);
      const purse = getPurse(db, spend.purseId);
      if (!purse) throw new PayPalError("Unknown purse.", 404);
      const at = stamp(now);
      setBalance(db, purse.id, purse.balanceCents + spend.amountCents!);
      updateSpend(db, spend.id, { status: "refunded", explanation, updatedAt: at });
      insertAudit(db, {
        id: nid("audit"),
        purseId: purse.id,
        actor: "paypal",
        action: "spend_refunded",
        detail: explanation,
        createdAt: at,
      });
    });
    const updated = getSpend(db, spend.id);
    if (!updated) return fail(500, "The refund was not recorded.");
    return { status: 200, body: { ok: true, explanation, spend: updated } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function createTopup(
  db: DatabaseSync,
  purseId: string,
  amountCents: number,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; order: PaypalOrder } | { ok: false; error: string }>> {
  const purse = getPurse(db, purseId);
  if (!purse) return fail(404, "Unknown purse.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail(400, "Enter a top-up amount in cents.");
  }
  try {
    const order = await clientFor(db, options).createOrder({
      amountCents,
      currency: purse.currency,
      kind: "topup",
      purseId: purse.id,
      customId: purse.id,
      description: `Fund ${purse.name}`,
    });
    insertAudit(db, {
      id: nid("audit"),
      purseId: purse.id,
      actor: "paypal",
      action: "topup_created",
      detail: `Created PayPal order ${order.id} for ${formatMoney(amountCents, purse.currency)}.`,
      createdAt: stamp(options?.now ?? new Date()),
    });
    return { status: 201, body: { ok: true, order } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function approvePaypalOrder(
  db: DatabaseSync,
  orderId: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; order: PaypalOrder } | { ok: false; error: string }>> {
  const record = getPaypalOrder(db, orderId);
  if (!record) return fail(404, "Unknown PayPal order.");
  try {
    const order = await clientFor(db, options).approveOrder(orderId);
    if (record.purseId) {
      insertAudit(db, {
        id: nid("audit"),
        purseId: record.purseId,
        actor: "paypal",
        action: "order_approved",
        detail: `Buyer approved PayPal order ${order.id}.`,
        createdAt: stamp(options?.now ?? new Date()),
      });
    }
    return { status: 200, body: { ok: true, order } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function captureTopup(
  db: DatabaseSync,
  orderId: string,
  options?: ActionOptions,
): Promise<
  ActionResult<{ ok: true; order: PaypalOrder; balanceCents: number } | { ok: false; error: string }>
> {
  const record = getPaypalOrder(db, orderId);
  if (!record) return fail(404, "Unknown PayPal order.");
  if (record.kind !== "topup" || !record.purseId) {
    return fail(400, "Only purse top-ups are captured from this route.");
  }
  try {
    let order: PaypalOrder | null = null;
    await transactionAsync(db, async () => {
      order = await clientFor(db, options).captureOrder(orderId);
      const purse = getPurse(db, record.purseId!);
      if (!purse) throw new PayPalError("Unknown purse.", 404);
      setBalance(db, purse.id, purse.balanceCents + record.amountCents);
      insertAudit(db, {
        id: nid("audit"),
        purseId: purse.id,
        actor: "paypal",
        action: "topup_captured",
        detail: `Captured PayPal order ${orderId} for ${formatMoney(record.amountCents, record.currency)}. Purse balance funded.`,
        createdAt: stamp(options?.now ?? new Date()),
      });
    });
    const purse = getPurse(db, record.purseId);
    if (!order || !purse) return fail(500, "The top-up was not recorded.");
    return { status: 200, body: { ok: true, order, balanceCents: purse.balanceCents } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}
