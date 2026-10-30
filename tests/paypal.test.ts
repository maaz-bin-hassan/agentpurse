import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/src/db/connection";
import { createMockPayPal } from "@/src/paypal/mock";
import { createLivePayPal } from "@/src/paypal/live";
import { PayPalError } from "@/src/paypal/types";

describe("PayPal mock", () => {
  it("walks a top-up from created to captured and refunds the capture", async () => {
    const db = openDatabase(":memory:");
    let tick = 0;
    const paypal = createMockPayPal(db, {
      now: () => new Date(Date.UTC(2026, 9, 30, 12, tick++, 0)),
      id: (prefix) => `${prefix}TEST`,
    });

    const created = await paypal.createOrder({
      amountCents: 10000,
      currency: "USD",
      kind: "topup",
      description: "Fund Maya's Household",
    });
    expect(created.status).toBe("CREATED");
    expect(created.id).toBe("PAY-MOCK-TEST");
    expect(created.purchase_units[0].amount.value).toBe("100.00");
    expect(created.links[0].href).toContain("sandbox.paypal.com");

    await expect(paypal.captureOrder(created.id)).rejects.toBeInstanceOf(PayPalError);

    const approved = await paypal.approveOrder(created.id);
    expect(approved.status).toBe("APPROVED");
    const captured = await paypal.captureOrder(approved.id);
    expect(captured.status).toBe("COMPLETED");
    expect(captured.purchase_units[0].payments?.captures?.[0].id).toBe("CAP-MOCK-TEST");
    await expect(paypal.captureOrder(captured.id)).rejects.toThrow(/already captured/);

    const refund = await paypal.refundCapture("CAP-MOCK-TEST");
    expect(refund.status).toBe("COMPLETED");
    expect(refund.amount.value).toBe("100.00");
    const after = await paypal.getOrder(created.id);
    expect(after.purchase_units[0].payments?.captures?.[0].status).toBe("REFUNDED");
    await expect(paypal.refundCapture("CAP-MOCK-TEST")).rejects.toThrow(/cannot be refunded/);
    db.close();
  });
});

describe("PayPal live adapter", () => {
  it("builds OAuth and Orders v2 requests without calling the network", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok_test", expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith("/v2/checkout/orders") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "CREATED",
            intent: "CAPTURE",
            purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }],
            links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1", rel: "approve", method: "GET" }],
            create_time: "2026-10-30T00:00:00Z",
            update_time: "2026-10-30T00:00:00Z",
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/v2/checkout/orders/ORDER1") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "CREATED",
            intent: "CAPTURE",
            purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }],
            links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1", rel: "approve", method: "GET" }],
            create_time: "2026-10-30T00:00:00Z",
            update_time: "2026-10-30T00:00:00Z",
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "COMPLETED",
            intent: "CAPTURE",
            purchase_units: [
              {
                amount: { currency_code: "USD", value: "10.00" },
                payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } }] },
              },
            ],
            links: [],
            create_time: "2026-10-30T00:00:00Z",
            update_time: "2026-10-30T00:01:00Z",
          }),
          { status: 201 },
        );
      }
      return new Response("missing", { status: 404 });
    });

    const paypal = createLivePayPal({
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const created = await paypal.createOrder({
      amountCents: 1000,
      currency: "USD",
      kind: "spend",
      customId: "spend_1",
      description: "Grocer",
    });
    expect(created.id).toBe("ORDER1");

    const auth = calls[0];
    expect(auth.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(String(auth.init?.headers && (auth.init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
    expect(auth.init?.body?.toString()).toContain("grant_type=client_credentials");

    const orderCall = calls[1];
    expect(orderCall.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    const headers = orderCall.init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok_test");
    expect(headers.get("PayPal-Request-Id")).toBeTruthy();
    expect(JSON.parse(String(orderCall.init?.body))).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: "10.00" }, custom_id: "spend_1" }],
    });

    await expect(paypal.approveOrder("ORDER1")).rejects.toThrow(/Buyer approval happens at PayPal/);
    const captured = await paypal.captureOrder("ORDER1");
    expect(captured.status).toBe("COMPLETED");
    expect(calls.some((call) => call.url.endsWith("/v2/checkout/orders/ORDER1/capture"))).toBe(true);
  });
});
