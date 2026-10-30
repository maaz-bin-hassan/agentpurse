import {
  getIntent,
  getPaypalOrder,
  getPaypalOrderByCapture,
  getPaypalOrderByCustomId,
  insertReceipt,
  newId,
  receiptForCapture,
  recordPaypalEvent,
  saveVault,
  getVault,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { createPayPalClient } from "@/src/paypal";
import type { WebhookVerifyInput } from "@/src/paypal/types";

interface CaptureResource {
  id?: string;
  custom_id?: string;
  amount?: { currency_code?: string; value?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
}

function cents(value?: string): number | null {
  if (!value) return null;
  const [d, f = ""] = value.split(".");
  if (!/^\d+$/.test(d)) return null;
  return Number(d) * 100 + Number((f + "00").slice(0, 2));
}

export async function handlePaypalWebhook(
  sql: Sql,
  rawBody: string,
  headers: {
    transmissionId: string;
    transmissionTime: string;
    transmissionSig: string;
    certUrl: string;
    authAlgo: string;
    webhookId: string;
  },
): Promise<{ status: number; body: { ok: boolean; error?: string; duplicate?: boolean } }> {
  let event: { id?: string; event_type?: string; resource?: CaptureResource & { id?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return { status: 400, body: { ok: false, error: "Webhook body is not JSON." } };
  }
  const paypal = createPayPalClient(sql);
  const input: WebhookVerifyInput = {
    transmissionId: headers.transmissionId,
    transmissionTime: headers.transmissionTime,
    transmissionSig: headers.transmissionSig,
    certUrl: headers.certUrl,
    authAlgo: headers.authAlgo,
    webhookId: headers.webhookId,
    rawBody,
    event,
  };
  const verified = await paypal.verifyWebhookSignature(input);
  if (!verified) return { status: 400, body: { ok: false, error: "Webhook signature was rejected." } };
  const fresh = await recordPaypalEvent(sql, {
    id: event.id ?? newId("evt"),
    transmissionId: headers.transmissionId,
    eventType: event.event_type ?? "UNKNOWN",
    resourceId: event.resource?.id ?? null,
    intentId: event.resource?.custom_id ?? null,
    verified: true,
    rawJson: rawBody,
    createdAt: new Date().toISOString(),
  });
  if (!fresh) return { status: 200, body: { ok: true, duplicate: true } };

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && event.resource?.id) {
    const captureId = event.resource.id;
    if (!(await receiptForCapture(sql, captureId, "capture"))) {
      const customId = event.resource.custom_id;
      const orderId = event.resource.supplementary_data?.related_ids?.order_id;
      const order = (customId ? await getPaypalOrderByCustomId(sql, customId) : undefined) ?? (orderId ? await getPaypalOrder(sql, orderId) : undefined) ?? (await getPaypalOrderByCapture(sql, captureId));
      const intent = order?.intentId ? await getIntent(sql, order.intentId) : customId ? await getIntent(sql, customId) : undefined;
      if (intent && order) {
        await insertReceipt(sql, {
          id: newId("rcpt"),
          intentId: intent.id,
          agentId: intent.agentId,
          ownerId: intent.ownerId,
          kind: "capture",
          amountCents: cents(event.resource.amount?.value) ?? order.amountCents,
          currency: event.resource.amount?.currency_code ?? order.currency,
          merchantName: intent.merchantName ?? "Merchant",
          paypalOrderId: order.id,
          captureId,
          refundId: null,
          customId: intent.id,
          webhookEventId: event.id ?? null,
          detail: intent.explanation ?? "Captured from PayPal webhook.",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" && event.resource?.id) {
    const captureId = event.resource.id;
    if (!(await receiptForCapture(sql, captureId, "refund"))) {
      const order = await getPaypalOrderByCapture(sql, captureId);
      const intent = order?.intentId ? await getIntent(sql, order.intentId) : undefined;
      if (intent && order) {
        await insertReceipt(sql, {
          id: newId("rcpt"),
          intentId: intent.id,
          agentId: intent.agentId,
          ownerId: intent.ownerId,
          kind: "refund",
          amountCents: order.amountCents,
          currency: order.currency,
          merchantName: intent.merchantName ?? "Merchant",
          paypalOrderId: order.id,
          captureId,
          refundId: event.id ?? null,
          customId: intent.id,
          webhookEventId: event.id ?? null,
          detail: "Refund recorded from PayPal webhook.",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  if (event.event_type === "VAULT.PAYMENT-TOKEN.DELETED" && event.resource?.id) {
    const rows = await sql.all("SELECT owner_id FROM vaults WHERE payment_token_id = ?", [event.resource.id]);
    for (const row of rows) {
      const ownerId = String(row.owner_id);
      const vault = await getVault(sql, ownerId);
      if (vault) {
        await saveVault(sql, { ...vault, status: "revoked", paymentTokenId: null, updatedAt: new Date().toISOString() });
      }
    }
  }

  return { status: 200, body: { ok: true } };
}
