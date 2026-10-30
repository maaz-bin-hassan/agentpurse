import { createHmac, randomBytes } from "node:crypto";
import { centsToDecimal } from "@/src/domain/money";
import {
  getPaypalOrder,
  getPaypalOrderByCapture,
  upsertPaypalOrder,
  type PaypalOrderRecord,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { webhookMessage } from "@/src/paypal/webhook";
import {
  PayPalError,
  type CreateOrderInput,
  type PayPalClient,
  type PaymentToken,
  type PaypalCapture,
  type PaypalOrder,
  type PaypalRefund,
  type SetupToken,
  type WebhookVerifyInput,
} from "@/src/paypal/types";

function token(prefix: string): string {
  return `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
}

function parseOrder(record: PaypalOrderRecord): PaypalOrder {
  return JSON.parse(record.rawJson) as PaypalOrder;
}

export function mockWebhookSecret(): string {
  return process.env.PAYPAL_WEBHOOK_SECRET || "mock-webhook-secret";
}

export function signMockWebhook(input: {
  transmissionId: string;
  transmissionTime: string;
  webhookId: string;
  rawBody: string;
  secret?: string;
}): string {
  const message = webhookMessage(input.transmissionId, input.transmissionTime, input.webhookId, input.rawBody);
  return createHmac("sha256", input.secret ?? mockWebhookSecret()).update(message).digest("base64");
}

export function createMockPayPal(
  sql: Sql,
  options?: { now?: () => Date; id?: (prefix: string) => string; webhookSecret?: string },
): PayPalClient {
  const now = options?.now ?? (() => new Date());
  const idFor = options?.id ?? token;
  const secret = options?.webhookSecret ?? mockWebhookSecret();

  async function requireOrder(orderId: string): Promise<{ record: PaypalOrderRecord; order: PaypalOrder }> {
    const record = await getPaypalOrder(sql, orderId);
    if (!record) throw new PayPalError(`Unknown PayPal order ${orderId}`, 404);
    return { record, order: parseOrder(record) };
  }

  async function save(record: PaypalOrderRecord, order: PaypalOrder): Promise<void> {
    await upsertPaypalOrder(sql, {
      ...record,
      status: order.status,
      captureId: order.purchase_units[0]?.payments?.captures?.[0]?.id ?? record.captureId,
      rawJson: JSON.stringify(order),
      updatedAt: order.update_time,
    });
  }

  return {
    mode: "mock",
    async createSetupToken(input): Promise<SetupToken> {
      const id = idFor("SETUP-MOCK-");
      const created = now().toISOString();
      const tokenBody: SetupToken = {
        id,
        status: "PAYER_ACTION_REQUIRED",
        customerId: `CUSTOMER-${id}`,
        links: [
          {
            href: `https://www.sandbox.paypal.com/agreements/approve?approval_session_id=${id}`,
            rel: "approve",
            method: "GET",
          },
        ],
      };
      await sql.exec(
        `INSERT INTO mock_setup_tokens (id, owner_id, status, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, input.ownerId, "PAYER_ACTION_REQUIRED", JSON.stringify(tokenBody), created, created],
      );
      return tokenBody;
    },
    async approveSetupToken(setupTokenId): Promise<SetupToken> {
      const row = await sql.get("SELECT raw_json, status FROM mock_setup_tokens WHERE id = ?", [setupTokenId]);
      if (!row) throw new PayPalError(`Unknown setup token ${setupTokenId}`, 404);
      const body = JSON.parse(String(row.raw_json)) as SetupToken;
      if (body.status !== "PAYER_ACTION_REQUIRED") {
        throw new PayPalError(`Setup token ${setupTokenId} is ${body.status}.`);
      }
      body.status = "APPROVED";
      await sql.exec("UPDATE mock_setup_tokens SET status = 'APPROVED', raw_json = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(body),
        now().toISOString(),
        setupTokenId,
      ]);
      return body;
    },
    async createPaymentToken(setupTokenId): Promise<PaymentToken> {
      const row = await sql.get("SELECT raw_json, status, owner_id FROM mock_setup_tokens WHERE id = ?", [setupTokenId]);
      if (!row) throw new PayPalError(`Unknown setup token ${setupTokenId}`, 404);
      const setup = JSON.parse(String(row.raw_json)) as SetupToken;
      if (setup.status !== "APPROVED") throw new PayPalError("The payer has not approved this setup token.");
      const id = idFor("VAULT-MOCK-");
      const payment: PaymentToken = {
        id,
        status: "ACTIVE",
        customerId: setup.customerId ?? `CUSTOMER-${id}`,
        payerEmail: "payer@example.com",
      };
      await sql.exec(
        `INSERT INTO mock_payment_tokens (id, setup_token_id, customer_id, payer_email, status, raw_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        [id, setupTokenId, payment.customerId, payment.payerEmail ?? null, JSON.stringify(payment), now().toISOString(), now().toISOString()],
      );
      return payment;
    },
    async getPaymentToken(paymentTokenId): Promise<PaymentToken> {
      const row = await sql.get("SELECT raw_json, status FROM mock_payment_tokens WHERE id = ?", [paymentTokenId]);
      if (!row || row.status === "DELETED") throw new PayPalError(`Unknown payment token ${paymentTokenId}`, 404);
      return JSON.parse(String(row.raw_json)) as PaymentToken;
    },
    async deletePaymentToken(paymentTokenId): Promise<void> {
      const row = await sql.get("SELECT id, status FROM mock_payment_tokens WHERE id = ?", [paymentTokenId]);
      if (!row || row.status === "DELETED") throw new PayPalError(`Unknown payment token ${paymentTokenId}`, 404);
      await sql.exec("UPDATE mock_payment_tokens SET status = 'DELETED' WHERE id = ?", [paymentTokenId]);
    },
    async createOrder(input: CreateOrderInput): Promise<PaypalOrder> {
      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new PayPalError("Amount must be a positive number of cents.", 422);
      }
      if (input.vaultId) {
        const tokenRow = await sql.get("SELECT status FROM mock_payment_tokens WHERE id = ?", [input.vaultId]);
        if (!tokenRow || tokenRow.status !== "ACTIVE") {
          throw new PayPalError(`Vault token ${input.vaultId} is not active.`, 422);
        }
      }
      const merchantInitiated = input.storedCredential?.payment_initiator === "MERCHANT";
      const created = now().toISOString();
      const id = idFor("PAY-MOCK-");
      const order: PaypalOrder = {
        id,
        status: merchantInitiated ? "APPROVED" : "CREATED",
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.customId,
            description: input.description,
            amount: { currency_code: input.currency, value: centsToDecimal(input.amountCents) },
            payee: input.payeeEmail ? { email_address: input.payeeEmail } : undefined,
          },
        ],
        payment_source: input.vaultId
          ? { paypal: { vault_id: input.vaultId, stored_credential: input.storedCredential } }
          : undefined,
        links: merchantInitiated
          ? []
          : [
              {
                href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
                rel: "approve",
                method: "GET",
              },
            ],
        create_time: created,
        update_time: created,
      };
      await upsertPaypalOrder(sql, {
        id,
        ownerId: input.ownerId ?? null,
        intentId: input.intentId ?? input.spendRequestId ?? null,
        kind: input.kind,
        status: order.status,
        currency: input.currency,
        amountCents: input.amountCents,
        captureId: null,
        vaultId: input.vaultId ?? null,
        payeeEmail: input.payeeEmail ?? null,
        customId: input.customId ?? null,
        rawJson: JSON.stringify(order),
        createdAt: created,
        updatedAt: created,
      });
      return order;
    },
    async getOrder(orderId) {
      return (await requireOrder(orderId)).order;
    },
    async approveOrder(orderId) {
      const { record, order } = await requireOrder(orderId);
      if (order.status !== "CREATED") throw new PayPalError(`Order ${orderId} is ${order.status} and cannot be approved.`);
      order.status = "APPROVED";
      order.update_time = now().toISOString();
      await save(record, order);
      return order;
    },
    async captureOrder(orderId) {
      const { record, order } = await requireOrder(orderId);
      if (order.status === "COMPLETED") throw new PayPalError(`Order ${orderId} is already captured.`);
      if (order.status !== "APPROVED") throw new PayPalError(`Order ${orderId} must be approved before capture.`);
      const capturedAt = now().toISOString();
      const capture: PaypalCapture = {
        id: idFor("CAP-MOCK-"),
        status: "COMPLETED",
        amount: order.purchase_units[0].amount,
        custom_id: order.purchase_units[0].custom_id,
      };
      order.status = "COMPLETED";
      order.update_time = capturedAt;
      order.purchase_units[0].payments = { captures: [capture] };
      await save(record, order);
      return order;
    },
    async refundCapture(captureId, amountCents) {
      const record = await getPaypalOrderByCapture(sql, captureId);
      if (!record) throw new PayPalError(`Unknown capture ${captureId}`, 404);
      const order = parseOrder(record);
      const capture = order.purchase_units[0]?.payments?.captures?.find((item) => item.id === captureId);
      if (!capture || capture.status !== "COMPLETED") throw new PayPalError(`Capture ${captureId} cannot be refunded.`);
      const refundCents = amountCents ?? record.amountCents;
      if (refundCents !== record.amountCents) throw new PayPalError("Partial refunds are not supported.");
      const created = now().toISOString();
      const refund: PaypalRefund = {
        id: idFor("REF-MOCK-"),
        status: "COMPLETED",
        capture_id: captureId,
        amount: { currency_code: record.currency, value: centsToDecimal(refundCents) },
        create_time: created,
      };
      capture.status = "REFUNDED";
      order.update_time = created;
      order.purchase_units[0].payments = {
        captures: order.purchase_units[0].payments?.captures,
        refunds: [...(order.purchase_units[0].payments?.refunds ?? []), refund],
      };
      await save(record, order);
      return refund;
    },
    async verifyWebhookSignature(input: WebhookVerifyInput) {
      const expected = signMockWebhook({
        transmissionId: input.transmissionId,
        transmissionTime: input.transmissionTime,
        webhookId: input.webhookId,
        rawBody: input.rawBody,
        secret,
      });
      return expected === input.transmissionSig;
    },
  };
}
