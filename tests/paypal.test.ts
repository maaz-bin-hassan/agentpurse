import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { createMockPayPal, signMockWebhook } from "@/src/paypal/mock";
import { createLivePayPal } from "@/src/paypal/live";
import { PayPalError } from "@/src/paypal/types";
import { DEMO_PAYEE } from "@/src/domain/payee";

describe("PayPal mock", () => {
  it("vaults a wallet without a purchase, charges the merchant, and refunds", async () => {
    const sql = await openDatabase(":memory:");
    let tick = 0;
    const paypal = createMockPayPal(sql, {
      now: () => new Date(Date.UTC(2026, 9, 30, 12, tick++, 0)),
      id: (prefix) => `${prefix}TEST`,
    });
    const setup = await paypal.createSetupToken({
      ownerId: "purse_maya",
      returnUrl: "http://localhost:3000/paypal/return",
      cancelUrl: "http://localhost:3000/paypal/cancel",
      description: "AgentPurse",
    });
    expect(setup.status).toBe("PAYER_ACTION_REQUIRED");
    expect(setup.links[0]?.href).toContain("sandbox.paypal.com");
    const approved = await paypal.approveSetupToken(setup.id);
    expect(approved.status).toBe("APPROVED");
    const payment = await paypal.createPaymentToken(setup.id);
    expect(payment.id).toBe("VAULT-MOCK-TEST");

    const order = await paypal.createOrder({
      amountCents: 1840,
      currency: "USD",
      kind: "charge",
      customId: "intent_oats",
      intentId: "intent_oats",
      payeeEmail: DEMO_PAYEE,
      vaultId: payment.id,
      storedCredential: {
        payment_initiator: "MERCHANT",
        usage: "SUBSEQUENT",
        usage_pattern: "UNSCHEDULED_POSTPAID",
      },
    });
    expect(order.status).toBe("APPROVED");
    expect(order.purchase_units[0]?.custom_id).toBe("intent_oats");
    expect(order.purchase_units[0]?.payee?.email_address).toBe(DEMO_PAYEE);
    expect(order.payment_source?.paypal?.vault_id).toBe(payment.id);
    expect(order.payment_source?.paypal?.stored_credential?.payment_initiator).toBe("MERCHANT");
    const captured = await paypal.captureOrder(order.id);
    expect(captured.status).toBe("COMPLETED");
    const refund = await paypal.refundCapture(captured.purchase_units[0].payments!.captures![0].id);
    expect(refund.status).toBe("COMPLETED");

    await paypal.deletePaymentToken(payment.id);
    await expect(
      paypal.createOrder({
        amountCents: 100,
        currency: "USD",
        kind: "charge",
        vaultId: payment.id,
        storedCredential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", usage_pattern: "UNSCHEDULED_POSTPAID" },
      }),
    ).rejects.toBeInstanceOf(PayPalError);

    const raw = JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED", id: "WH-1" });
    const sig = signMockWebhook({
      transmissionId: "tx",
      transmissionTime: "2026-10-30T12:00:00Z",
      webhookId: "WHID",
      rawBody: raw,
    });
    expect(
      await paypal.verifyWebhookSignature({
        transmissionId: "tx",
        transmissionTime: "2026-10-30T12:00:00Z",
        transmissionSig: sig,
        certUrl: "https://api.sandbox.paypal.com/cert",
        authAlgo: "SHA256withRSA",
        webhookId: "WHID",
        rawBody: raw,
        event: JSON.parse(raw),
      }),
    ).toBe(true);
    expect(
      await paypal.verifyWebhookSignature({
        transmissionId: "tx",
        transmissionTime: "2026-10-30T12:00:00Z",
        transmissionSig: "nope",
        certUrl: "https://api.sandbox.paypal.com/cert",
        authAlgo: "SHA256withRSA",
        webhookId: "WHID",
        rawBody: raw,
        event: JSON.parse(raw),
      }),
    ).toBe(false);
    await sql.close();
  });
});

describe("PayPal live adapter", () => {
  it("builds vault, order, and webhook verification requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok_test", expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith("/v3/vault/setup-tokens") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "SETUP1", status: "PAYER_ACTION_REQUIRED", links: [] }), { status: 201 });
      }
      if (url.endsWith("/v3/vault/payment-tokens") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "VAULT1", customer: { id: "CUST1" } }), { status: 201 });
      }
      if (url.includes("/v3/vault/payment-tokens/VAULT1") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/v2/checkout/orders") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "COMPLETED",
            intent: "CAPTURE",
            purchase_units: [{ amount: { currency_code: "USD", value: "10.00" }, custom_id: "intent_1" }],
            links: [],
            create_time: "2026-10-30T00:00:00Z",
            update_time: "2026-10-30T00:00:00Z",
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
        return new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    });
    const paypal = createLivePayPal({ clientId: "client", clientSecret: "secret", fetchImpl: fetchImpl as unknown as typeof fetch });
    const setup = await paypal.createSetupToken({
      ownerId: "purse_maya",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
      description: "AgentPurse",
    });
    expect(setup.id).toBe("SETUP1");
    const token = await paypal.createPaymentToken("SETUP1");
    expect(token.id).toBe("VAULT1");
    const order = await paypal.createOrder({
      amountCents: 1000,
      currency: "USD",
      kind: "charge",
      customId: "intent_1",
      payeeEmail: "sb-merchant@business.example.com",
      vaultId: "VAULT1",
      storedCredential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", usage_pattern: "UNSCHEDULED_POSTPAID" },
    });
    expect(order.id).toBe("ORDER1");
    const orderCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"));
    const body = JSON.parse(String(orderCall?.init?.body));
    expect(body.purchase_units[0].custom_id).toBe("intent_1");
    expect(body.purchase_units[0].payee.email_address).toBe("sb-merchant@business.example.com");
    expect(body.payment_source.paypal.vault_id).toBe("VAULT1");
    expect(body.payment_source.paypal.stored_credential.payment_initiator).toBe("MERCHANT");
    await paypal.deletePaymentToken("VAULT1");
    expect(calls.some((call) => call.url.endsWith("/v3/vault/payment-tokens/VAULT1") && call.init?.method === "DELETE")).toBe(true);
    const verified = await paypal.verifyWebhookSignature({
      transmissionId: "tx",
      transmissionTime: "time",
      transmissionSig: "sig",
      certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
      authAlgo: "SHA256withRSA",
      webhookId: "WHID",
      rawBody: "{}",
      event: { id: "evt" },
    });
    expect(verified).toBe(true);
    const verifyCall = calls.find((call) => call.url.endsWith("/verify-webhook-signature"));
    expect(JSON.parse(String(verifyCall?.init?.body)).webhook_id).toBe("WHID");
  });
});
