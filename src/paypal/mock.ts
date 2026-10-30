import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { centsToDecimal } from "@/src/domain/money";
import type { PaypalOrderRecord } from "@/src/domain/types";
import { getPaypalOrder, getPaypalOrderByCapture, upsertPaypalOrder } from "@/src/db/repository";
import {
  PayPalError,
  type CreateOrderInput,
  type PayPalClient,
  type PaypalCapture,
  type PaypalOrder,
  type PaypalRefund,
} from "@/src/paypal/types";

function token(prefix: string): string {
  return `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
}

function parseOrder(record: PaypalOrderRecord): PaypalOrder {
  return JSON.parse(record.rawJson) as PaypalOrder;
}

function save(db: DatabaseSync, record: PaypalOrderRecord, order: PaypalOrder): PaypalOrderRecord {
  const next: PaypalOrderRecord = {
    ...record,
    status: order.status,
    captureId: order.purchase_units[0]?.payments?.captures?.[0]?.id ?? record.captureId,
    rawJson: JSON.stringify(order),
    updatedAt: order.update_time,
  };
  upsertPaypalOrder(db, next);
  return next;
}

export function createMockPayPal(
  db: DatabaseSync,
  options?: { now?: () => Date; id?: (prefix: string) => string },
): PayPalClient {
  const now = options?.now ?? (() => new Date());
  const idFor = options?.id ?? token;

  function requireOrder(orderId: string): { record: PaypalOrderRecord; order: PaypalOrder } {
    const record = getPaypalOrder(db, orderId);
    if (!record) throw new PayPalError(`Unknown PayPal order ${orderId}`, 404);
    return { record, order: parseOrder(record) };
  }

  return {
    mode: "mock",
    async createOrder(input: CreateOrderInput): Promise<PaypalOrder> {
      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new PayPalError("Amount must be a positive number of cents.", 422);
      }
      const created = now().toISOString();
      const id = idFor("PAY-MOCK-");
      const order: PaypalOrder = {
        id,
        status: "CREATED",
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.customId,
            description: input.description,
            amount: { currency_code: input.currency, value: centsToDecimal(input.amountCents) },
          },
        ],
        links: [
          {
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
            rel: "approve",
            method: "GET",
          },
        ],
        create_time: created,
        update_time: created,
      };
      upsertPaypalOrder(db, {
        id,
        purseId: input.purseId ?? null,
        spendRequestId: input.spendRequestId ?? null,
        kind: input.kind,
        status: "CREATED",
        currency: input.currency,
        amountCents: input.amountCents,
        captureId: null,
        customId: input.customId ?? null,
        rawJson: JSON.stringify(order),
        createdAt: created,
        updatedAt: created,
      });
      return order;
    },

    async getOrder(orderId: string): Promise<PaypalOrder> {
      return requireOrder(orderId).order;
    },

    async approveOrder(orderId: string): Promise<PaypalOrder> {
      const { record, order } = requireOrder(orderId);
      if (order.status !== "CREATED") {
        throw new PayPalError(`Order ${orderId} is ${order.status} and cannot be approved.`);
      }
      order.status = "APPROVED";
      order.update_time = now().toISOString();
      save(db, record, order);
      return order;
    },

    async captureOrder(orderId: string): Promise<PaypalOrder> {
      const { record, order } = requireOrder(orderId);
      if (order.status === "COMPLETED") {
        throw new PayPalError(`Order ${orderId} is already captured.`);
      }
      if (order.status !== "APPROVED") {
        throw new PayPalError(`Order ${orderId} must be approved before capture.`);
      }
      const capturedAt = now().toISOString();
      const capture: PaypalCapture = {
        id: idFor("CAP-MOCK-"),
        status: "COMPLETED",
        amount: order.purchase_units[0].amount,
      };
      order.status = "COMPLETED";
      order.update_time = capturedAt;
      order.purchase_units[0].payments = { captures: [capture] };
      save(db, record, order);
      return order;
    },

    async refundCapture(captureId: string, amountCents?: number): Promise<PaypalRefund> {
      const record = getPaypalOrderByCapture(db, captureId);
      if (!record) throw new PayPalError(`Unknown capture ${captureId}`, 404);
      const order = parseOrder(record);
      const capture = order.purchase_units[0]?.payments?.captures?.find((item) => item.id === captureId);
      if (!capture || capture.status !== "COMPLETED") {
        throw new PayPalError(`Capture ${captureId} cannot be refunded.`);
      }
      const refundCents = amountCents ?? record.amountCents;
      if (refundCents !== record.amountCents) {
        throw new PayPalError("Partial refunds are not supported.");
      }
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
      save(db, record, order);
      return refund;
    },
  };
}
