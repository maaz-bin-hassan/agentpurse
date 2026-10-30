import type { AppEnv } from "@/src/config";
import { assessIntent } from "@/src/ai/guard";
import { parseSpendIntent } from "@/src/ai/intent";
import { merchantPayee } from "@/src/domain/payee";
import { formatMoney } from "@/src/domain/money";
import { periodStart } from "@/src/domain/period";
import type { Agent, IntentRecord, Merchant, Owner, Vault } from "@/src/domain/types";
import {
  addAllowance,
  findMerchantByName,
  getAgent,
  getIntent,
  getOwner,
  getVault,
  insertApproval,
  insertAudit,
  insertIntent,
  insertNotification,
  insertReceipt,
  latestApproval,
  listMerchants,
  markApproval,
  netSpentCents,
  newId,
  receiptForCapture,
  setAgentStatus,
  setPanic,
  spentSince,
  updateIntent,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { evaluateSpend, type ClerkResult } from "@/src/policy/engine";
import { createPayPalClient, PayPalError, type PayPalClient, type PaypalOrder, type StoredCredential } from "@/src/paypal";
import { fail, type ActionResult } from "@/src/server/http";

const MIT: StoredCredential = {
  payment_initiator: "MERCHANT",
  usage: "SUBSEQUENT",
  usage_pattern: "UNSCHEDULED_POSTPAID",
};

export interface ActionOptions {
  now?: Date;
  env?: AppEnv;
  paypal?: PayPalClient;
}

function clientFor(sql: Sql, options?: ActionOptions): PayPalClient {
  return options?.paypal ?? createPayPalClient(sql, options?.env ?? process.env);
}

function stamp(now: Date): string {
  return now.toISOString();
}

function captureIdOf(order: PaypalOrder): string | null {
  return order.purchase_units[0]?.payments?.captures?.[0]?.id ?? null;
}

async function clerkFor(
  sql: Sql,
  input: { owner: Owner; agent: Agent; vault: Vault | undefined; merchant: Merchant | undefined; merchantName: string | null; amountCents: number | null; currency: string | null; category: IntentRecord["category"]; intentComplete: boolean; now: Date; humanApproved?: boolean },
): Promise<ClerkResult> {
  const spent = await netSpentCents(sql, input.agent.id);
  const daily = await spentSince(sql, input.agent.id, periodStart("daily", input.now));
  return evaluateSpend({
    ownerName: input.owner.name,
    agentName: input.agent.name,
    agentStatus: input.agent.status,
    panicFrozen: input.owner.panicFrozen,
    vaultReady: input.vault?.status === "vaulted" && Boolean(input.vault.paymentTokenId),
    intentComplete: input.intentComplete,
    amountCents: input.amountCents,
    currency: input.currency,
    purseCurrency: "USD",
    merchantName: input.merchantName,
    merchantBlocked: input.merchant?.blocked ?? false,
    merchantTrusted: input.merchant ? input.merchant.trusted : false,
    category: input.category,
    categoryAllowed: input.category ? input.agent.allowedCategories.includes(input.category) : false,
    perTxnCapCents: input.agent.perTxnCapCents,
    dailyCapCents: input.agent.dailyCapCents,
    dailySpentCents: daily,
    allowanceRemainingCents: input.agent.allowanceCents - spent,
    approvalThresholdCents: input.agent.approvalThresholdCents,
    humanApproved: input.humanApproved,
  });
}

async function settle(
  sql: Sql,
  paypal: PayPalClient,
  input: { intent: IntentRecord; owner: Owner; agent: Agent; vault: Vault; explanation: string; now: Date; env?: AppEnv },
): Promise<PaypalOrder> {
  if (!input.vault.paymentTokenId || input.intent.amountCents == null || !input.intent.currency) {
    throw new PayPalError("This intent cannot be charged.");
  }
  const created = await paypal.createOrder({
    amountCents: input.intent.amountCents,
    currency: input.intent.currency,
    kind: "charge",
    customId: input.intent.id,
    intentId: input.intent.id,
    ownerId: input.owner.id,
    description: `${input.agent.name} pays ${input.intent.merchantName ?? "a merchant"}`,
    payeeEmail: input.intent.merchantEmail ?? merchantPayee(input.env),
    vaultId: input.vault.paymentTokenId,
    storedCredential: MIT,
  });
  const captured = created.status === "COMPLETED" ? created : await paypal.captureOrder(created.id);
  const captureId = captureIdOf(captured);
  if (!captureId) throw new PayPalError("PayPal capture did not return a capture id.");
  const at = stamp(input.now);
  if (!(await receiptForCapture(sql, captureId, "capture"))) {
    await insertReceipt(sql, {
      id: newId("rcpt"),
      intentId: input.intent.id,
      agentId: input.agent.id,
      ownerId: input.owner.id,
      kind: "capture",
      amountCents: input.intent.amountCents,
      currency: input.intent.currency,
      merchantName: input.intent.merchantName ?? "Merchant",
      paypalOrderId: captured.id,
      captureId,
      refundId: null,
      customId: input.intent.id,
      webhookEventId: null,
      detail: input.explanation,
      createdAt: at,
    });
  }
  await updateIntent(sql, input.intent.id, {
    status: "captured",
    decision: "allow",
    explanation: input.explanation,
    paypalOrderId: captured.id,
    captureId,
    approvalMethod: input.intent.approvalMethod ?? "auto",
    updatedAt: at,
  });
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId: input.owner.id,
    actor: input.agent.name.toLowerCase(),
    action: "spend_captured",
    detail: input.explanation,
    createdAt: at,
  });
  return captured;
}

export async function requestPurchase(
  sql: Sql,
  agentId: string,
  text: string,
  options?: ActionOptions & { originalTask?: string; pageExcerpt?: string | null },
): Promise<ActionResult<{ ok: true; explanation: string; intent: IntentRecord; spend: IntentRecord; order: PaypalOrder | null } | { ok: false; error: string }>> {
  const now = options?.now ?? new Date();
  const trimmed = text.trim();
  if (!trimmed) return fail(400, "Write the payment in a sentence.");
  const agent = await getAgent(sql, agentId);
  if (!agent) return fail(404, "Unknown agent.");
  const owner = await getOwner(sql, agent.ownerId);
  if (!owner) return fail(404, "Unknown household.");
  const vault = await getVault(sql, owner.id);
  const intentParsed = await parseSpendIntent(trimmed, { merchants: await listMerchants(sql), env: options?.env ?? process.env });
  const merchant = intentParsed.merchantName ? await findMerchantByName(sql, intentParsed.merchantName) : undefined;
  const originalTask = options?.originalTask?.trim() || trimmed;
  const guard = assessIntent({
    originalTask,
    merchantName: intentParsed.merchantName,
    amountCents: intentParsed.amountCents,
    category: intentParsed.category,
    purpose: intentParsed.purpose,
    pageExcerpt: options?.pageExcerpt,
  });
  if (guard.decision === "block") {
    const at = stamp(now);
    const intentId = newId("intent");
    const explanation = guard.reasons.map((reason) => reason.sentence).join(" ");
    await insertIntent(sql, {
      id: intentId,
      agentId: agent.id,
      ownerId: owner.id,
      originalTask,
      rawText: trimmed,
      pageExcerpt: options?.pageExcerpt ?? null,
      merchantName: intentParsed.merchantName,
      merchantEmail: merchant?.paypalEmail ?? null,
      amountCents: intentParsed.amountCents,
      currency: intentParsed.currency,
      category: intentParsed.category,
      purpose: intentParsed.purpose,
      confidence: intentParsed.confidence,
      guardDecision: "block",
      guardReasons: guard.reasons,
      decision: "deny",
      decisionReasons: guard.reasons,
      explanation,
      status: "blocked",
      paypalOrderId: null,
      captureId: null,
      approvalMethod: null,
      quoteId: null,
      createdAt: at,
      updatedAt: at,
    });
    const intent = await getIntent(sql, intentId);
    if (!intent) return fail(500, "The block was not recorded.");
    return { status: 200, body: { ok: true, explanation, intent, spend: intent, order: null } };
  }
  const clerk = await clerkFor(sql, {
    owner,
    agent,
    vault,
    merchant,
    merchantName: intentParsed.merchantName,
    amountCents: intentParsed.amountCents,
    currency: intentParsed.currency,
    category: intentParsed.category,
    intentComplete: intentParsed.complete,
    now,
  });
  const at = stamp(now);
  const intentId = newId("intent");
  const draft = {
    id: intentId,
    agentId: agent.id,
    ownerId: owner.id,
    originalTask,
    rawText: trimmed,
    pageExcerpt: options?.pageExcerpt ?? null,
    merchantName: intentParsed.merchantName,
    merchantEmail: merchant?.paypalEmail ?? merchantPayee(options?.env),
    amountCents: intentParsed.amountCents,
    currency: intentParsed.currency,
    category: intentParsed.category,
    purpose: intentParsed.purpose,
    confidence: intentParsed.confidence,
    guardDecision: "pass" as const,
    guardReasons: [],
    decision: clerk.decision,
    decisionReasons: clerk.reasons,
    explanation: clerk.explanation,
    status: "denied" as const,
    paypalOrderId: null,
    captureId: null,
    approvalMethod: clerk.decision === "allow" ? "auto" : null,
    quoteId: null,
    createdAt: at,
    updatedAt: at,
  };

  if (clerk.decision === "allow" && vault?.paymentTokenId && intentParsed.amountCents != null && intentParsed.currency) {
    await insertIntent(sql, draft);
    try {
      const order = await settle(sql, clientFor(sql, options), {
        intent: { ...draft, guardDecision: "pass" },
        owner,
        agent,
        vault,
        explanation: clerk.explanation,
        now,
        env: options?.env,
      });
      const intent = await getIntent(sql, intentId);
      if (!intent) return fail(500, "The payment was captured but not recorded.");
      return { status: 200, body: { ok: true, explanation: intent.explanation ?? clerk.explanation, intent, spend: intent, order } };
    } catch (error) {
      if (error instanceof PayPalError) return fail(error.status, error.message);
      throw error;
    }
  }

  const status = clerk.decision === "needs_approval" ? "pending_approval" : clerk.decision === "needs_clarification" ? "needs_clarification" : "denied";
  await insertIntent(sql, { ...draft, status });
  if (status === "pending_approval") {
    await insertApproval(sql, {
      id: newId("approval"),
      spendRequestId: intentId,
      decision: "pending",
      note: null,
      decidedAt: null,
      createdAt: at,
    });
    await insertNotification(sql, {
      id: newId("note"),
      ownerId: owner.id,
      intentId,
      title: `Approve ${draft.merchantName ?? "a payment"}?`,
      body: clerk.explanation,
      delivered: false,
      createdAt: at,
    });
  }
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId: owner.id,
    actor: status === "denied" ? "clerk" : agent.name.toLowerCase(),
    action: `spend_${status}`,
    detail: clerk.explanation,
    createdAt: at,
  });
  const intent = await getIntent(sql, intentId);
  if (!intent) return fail(500, "The decision was not recorded.");
  return { status: 200, body: { ok: true, explanation: clerk.explanation, intent, spend: intent, order: null } };
}

export async function approveIntent(
  sql: Sql,
  intentId: string,
  note?: string,
  options?: ActionOptions & { method?: string; webauthnVerified?: boolean },
): Promise<ActionResult<{ ok: true; explanation: string; intent: IntentRecord; spend: IntentRecord; order: PaypalOrder } | { ok: false; error: string }>> {
  const now = options?.now ?? new Date();
  const intent = await getIntent(sql, intentId);
  if (!intent) return fail(404, "Unknown intent.");
  if (intent.status !== "pending_approval") return fail(409, "That request is not waiting for approval.");
  const agent = await getAgent(sql, intent.agentId);
  const owner = agent ? await getOwner(sql, agent.ownerId) : undefined;
  const vault = owner ? await getVault(sql, owner.id) : undefined;
  if (!agent || !owner || !vault) return fail(404, "This intent is missing its household.");
  const merchant = intent.merchantName ? await findMerchantByName(sql, intent.merchantName) : undefined;
  const clerk = await clerkFor(sql, {
    owner,
    agent,
    vault,
    merchant,
    merchantName: intent.merchantName,
    amountCents: intent.amountCents,
    currency: intent.currency,
    category: intent.category,
    intentComplete: true,
    now,
    humanApproved: true,
  });
  if (clerk.decision !== "allow") return fail(409, `Still blocked. ${clerk.explanation}`);
  const approval = await latestApproval(sql, intent.id);
  if (approval) {
    await markApproval(sql, approval.id, "approved", note?.trim() || null, options?.method ?? "dashboard", Boolean(options?.webauthnVerified), stamp(now));
  }
  try {
    const order = await settle(sql, clientFor(sql, options), {
      intent: { ...intent, approvalMethod: options?.method ?? "dashboard" },
      owner,
      agent,
      vault,
      explanation: clerk.explanation,
      now,
      env: options?.env,
    });
    const updated = await getIntent(sql, intent.id);
    if (!updated) return fail(500, "The approval was not recorded.");
    return { status: 200, body: { ok: true, explanation: updated.explanation ?? clerk.explanation, intent: updated, spend: updated, order } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function denyIntent(
  sql: Sql,
  intentId: string,
  note?: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; explanation: string; intent: IntentRecord; spend: IntentRecord } | { ok: false; error: string }>> {
  const now = options?.now ?? new Date();
  const intent = await getIntent(sql, intentId);
  if (!intent) return fail(404, "Unknown intent.");
  if (intent.status !== "pending_approval") return fail(409, "That request is not waiting for approval.");
  const owner = await getOwner(sql, intent.ownerId);
  const trimmed = note?.trim();
  const explanation = trimmed ? `${owner?.name ?? "The owner"} denied the hold. ${trimmed}` : `${owner?.name ?? "The owner"} denied the hold.`;
  const at = stamp(now);
  await updateIntent(sql, intent.id, { status: "denied", decision: "deny", explanation, updatedAt: at });
  const approval = await latestApproval(sql, intent.id);
  if (approval) await markApproval(sql, approval.id, "denied", trimmed || null, "dashboard", false, at);
  await insertAudit(sql, { id: newId("audit"), ownerId: intent.ownerId, actor: owner?.name ?? "owner", action: "spend_denied", detail: explanation, createdAt: at });
  const updated = await getIntent(sql, intent.id);
  if (!updated) return fail(500, "The denial was not recorded.");
  return { status: 200, body: { ok: true, explanation, intent: updated, spend: updated } };
}

export async function refundIntent(
  sql: Sql,
  intentId: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; explanation: string; intent: IntentRecord; spend: IntentRecord } | { ok: false; error: string }>> {
  const now = options?.now ?? new Date();
  const intent = await getIntent(sql, intentId);
  if (!intent) return fail(404, "Unknown intent.");
  if (intent.status !== "captured" || !intent.captureId || intent.amountCents == null) {
    return fail(409, "Only a captured payment can be refunded.");
  }
  try {
    const refund = await clientFor(sql, options).refundCapture(intent.captureId, intent.amountCents);
    const explanation = `Refunded ${formatMoney(intent.amountCents, intent.currency ?? "USD")} to the payer's PayPal.`;
    const at = stamp(now);
    if (!(await receiptForCapture(sql, intent.captureId, "refund"))) {
      await insertReceipt(sql, {
        id: newId("rcpt"),
        intentId: intent.id,
        agentId: intent.agentId,
        ownerId: intent.ownerId,
        kind: "refund",
        amountCents: intent.amountCents,
        currency: intent.currency ?? "USD",
        merchantName: intent.merchantName ?? "Merchant",
        paypalOrderId: intent.paypalOrderId,
        captureId: intent.captureId,
        refundId: refund.id,
        customId: intent.id,
        webhookEventId: null,
        detail: explanation,
        createdAt: at,
      });
    }
    await updateIntent(sql, intent.id, { status: "refunded", explanation, updatedAt: at });
    await insertAudit(sql, { id: newId("audit"), ownerId: intent.ownerId, actor: "paypal", action: "spend_refunded", detail: explanation, createdAt: at });
    const updated = await getIntent(sql, intent.id);
    if (!updated) return fail(500, "The refund was not recorded.");
    return { status: 200, body: { ok: true, explanation, intent: updated, spend: updated } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function beginPaypalApproval(
  sql: Sql,
  intentId: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; url: string; paypalUrl: string; orderId: string } | { ok: false; error: string }>> {
  const intent = await getIntent(sql, intentId);
  if (!intent) return fail(404, "Unknown intent.");
  if (intent.status !== "pending_approval") return fail(409, "That request is not waiting for approval.");
  const vault = await getVault(sql, intent.ownerId);
  if (!vault?.paymentTokenId) return fail(409, "Link PayPal before using the approval link.");
  if (intent.amountCents == null || !intent.currency) return fail(409, "The intent has no amount.");
  const order = await clientFor(sql, options).createOrder({
    amountCents: intent.amountCents,
    currency: intent.currency,
    kind: "approval",
    customId: intent.id,
    intentId: intent.id,
    ownerId: intent.ownerId,
    payeeEmail: intent.merchantEmail ?? merchantPayee(options?.env),
    vaultId: vault.paymentTokenId,
    description: `Approval for ${intent.merchantName ?? "a payment"}`,
    storedCredential: { payment_initiator: "CUSTOMER", usage: "SUBSEQUENT", usage_pattern: "UNSCHEDULED_POSTPAID" },
  });
  const paypalUrl = order.links.find((link) => link.rel === "approve")?.href ?? "";
  await updateIntent(sql, intent.id, { status: "awaiting_paypal", paypalOrderId: order.id, approvalMethod: "paypal_link", updatedAt: stamp(options?.now ?? new Date()) });
  return { status: 200, body: { ok: true, url: `/paypal/approve/${order.id}`, paypalUrl, orderId: order.id } };
}

export async function finishPaypalApproval(
  sql: Sql,
  orderId: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; explanation: string } | { ok: false; error: string }>> {
  const { getPaypalOrder } = await import("@/src/db/repository");
  const record = await getPaypalOrder(sql, orderId);
  if (!record?.intentId) return fail(404, "Unknown PayPal order.");
  const intent = await getIntent(sql, record.intentId);
  const agent = intent ? await getAgent(sql, intent.agentId) : undefined;
  const owner = intent ? await getOwner(sql, intent.ownerId) : undefined;
  const vault = owner ? await getVault(sql, owner.id) : undefined;
  if (!intent || !agent || !owner || !vault) return fail(404, "The approval is missing its household.");
  try {
    const paypal = clientFor(sql, options);
    await paypal.approveOrder(orderId);
    const captured = await paypal.captureOrder(orderId);
    const captureId = captured.purchase_units[0]?.payments?.captures?.[0]?.id;
    if (!captureId || intent.amountCents == null) return fail(502, "PayPal did not capture the approval.");
    const explanation = `Paid ${intent.merchantName ?? "the merchant"} ${formatMoney(intent.amountCents)} after PayPal approval.`;
    const at = stamp(options?.now ?? new Date());
    await insertReceipt(sql, {
      id: newId("rcpt"),
      intentId: intent.id,
      agentId: agent.id,
      ownerId: owner.id,
      kind: "capture",
      amountCents: intent.amountCents,
      currency: intent.currency ?? "USD",
      merchantName: intent.merchantName ?? "Merchant",
      paypalOrderId: captured.id,
      captureId,
      refundId: null,
      customId: intent.id,
      webhookEventId: null,
      detail: explanation,
      createdAt: at,
    });
    await updateIntent(sql, intent.id, { status: "captured", decision: "allow", explanation, captureId, paypalOrderId: captured.id, updatedAt: at });
    return { status: 200, body: { ok: true, explanation } };
  } catch (error) {
    if (error instanceof PayPalError) return fail(error.status, error.message);
    throw error;
  }
}

export async function raiseAllowance(
  sql: Sql,
  agentId: string,
  amountCents: number,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; allowanceCents: number } | { ok: false; error: string }>> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail(400, "Enter an allowance in cents.");
  const agent = await getAgent(sql, agentId);
  if (!agent) return fail(404, "Unknown agent.");
  await addAllowance(sql, agentId, amountCents);
  const updated = await getAgent(sql, agentId);
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId: agent.ownerId,
    actor: "owner",
    action: "allowance_raised",
    detail: `Raised ${agent.name}'s allowance by ${formatMoney(amountCents)}. This is a ledger cap, not a PayPal balance.`,
    createdAt: stamp(options?.now ?? new Date()),
  });
  return { status: 200, body: { ok: true, allowanceCents: updated?.allowanceCents ?? agent.allowanceCents + amountCents } };
}

export async function pauseAgent(sql: Sql, agentId: string, paused: boolean): Promise<ActionResult<{ ok: true } | { ok: false; error: string }>> {
  const agent = await getAgent(sql, agentId);
  if (!agent) return fail(404, "Unknown agent.");
  await setAgentStatus(sql, agentId, paused ? "paused" : "active");
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId: agent.ownerId,
    actor: "owner",
    action: paused ? "agent_paused" : "agent_resumed",
    detail: paused ? `${agent.name} is paused.` : `${agent.name} can pay again.`,
    createdAt: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true } };
}

export async function panicFreeze(
  sql: Sql,
  ownerId: string,
  frozen: boolean,
): Promise<ActionResult<{ ok: true } | { ok: false; error: string }>> {
  const owner = await getOwner(sql, ownerId);
  if (!owner) return fail(404, "Unknown household.");
  await setPanic(sql, ownerId, frozen);
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId,
    actor: owner.name,
    action: frozen ? "panic_freeze" : "panic_cleared",
    detail: frozen ? "Panic freeze is on. No agent can pay." : "Panic freeze is off.",
    createdAt: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true } };
}

export async function revokeVault(
  sql: Sql,
  ownerId: string,
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true } | { ok: false; error: string }>> {
  const owner = await getOwner(sql, ownerId);
  const vault = await getVault(sql, ownerId);
  if (!owner || !vault?.paymentTokenId) return fail(404, "No PayPal wallet is linked.");
  try {
    await clientFor(sql, options).deletePaymentToken(vault.paymentTokenId);
  } catch (error) {
    if (error instanceof PayPalError && error.status !== 404) return fail(error.status, error.message);
  }
  await saveVaultRevoked(sql, vault);
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId,
    actor: owner.name,
    action: "vault_revoked",
    detail: `Deleted PayPal payment token ${vault.paymentTokenId}.`,
    createdAt: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true } };
}

async function saveVaultRevoked(sql: Sql, vault: Vault): Promise<void> {
  const { saveVault } = await import("@/src/db/repository");
  await saveVault(sql, { ...vault, status: "revoked", paymentTokenId: null, updatedAt: new Date().toISOString() });
}
