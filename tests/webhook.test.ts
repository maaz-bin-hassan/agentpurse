import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/paypal/webhooks/route";
import { openDatabase } from "@/src/db/connection";
import { netSpentCents, receiptForCapture } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";
import { signMockWebhook } from "@/src/paypal/mock";
import { handlePaypalWebhook } from "@/src/server/webhooks";

describe("PayPal webhooks", () => {
  it("rejects a bad signature and records a capture once", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql);
    await sql.exec("DELETE FROM receipts WHERE capture_id = ?", ["CAP-MOCK-CLOUD012"]);
    expect(await netSpentCents(sql, "agent_stack")).toBe(0);
    const event = {
      id: "WH-CAPTURE-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAP-MOCK-CLOUD012",
        custom_id: "intent_cloudapps",
        amount: { currency_code: "USD", value: "12.00" },
      },
    };
    const raw = JSON.stringify(event);
    const bad = await handlePaypalWebhook(sql, raw, {
      transmissionId: "tx-1",
      transmissionTime: "2026-10-30T12:00:00Z",
      transmissionSig: "nope",
      certUrl: "https://api.sandbox.paypal.com/cert",
      authAlgo: "SHA256withRSA",
      webhookId: "WHID",
    });
    expect(bad.status).toBe(400);

    const sig = signMockWebhook({ transmissionId: "tx-1", transmissionTime: "2026-10-30T12:00:00Z", webhookId: "WHID", rawBody: raw });
    const ok = await handlePaypalWebhook(sql, raw, {
      transmissionId: "tx-1",
      transmissionTime: "2026-10-30T12:00:00Z",
      transmissionSig: sig,
      certUrl: "https://api.sandbox.paypal.com/cert",
      authAlgo: "SHA256withRSA",
      webhookId: "WHID",
    });
    expect(ok.status).toBe(200);
    expect(await receiptForCapture(sql, "CAP-MOCK-CLOUD012", "capture")).toBeTruthy();
    const again = await handlePaypalWebhook(sql, raw, {
      transmissionId: "tx-1",
      transmissionTime: "2026-10-30T12:00:00Z",
      transmissionSig: sig,
      certUrl: "https://api.sandbox.paypal.com/cert",
      authAlgo: "SHA256withRSA",
      webhookId: "WHID",
    });
    expect(again.body.duplicate).toBe(true);
    expect(await netSpentCents(sql, "agent_stack")).toBe(1200);
    await sql.close();
  });

  it("serves the webhook route", async () => {
    const { closeDb } = await import("@/src/db/connection");
    process.env.AGENTPURSE_DB = `/tmp/agentpurse-webhook-${process.pid}.db`;
    process.env.AGENTPURSE_AUTO_SEED = "0";
    delete process.env.DATABASE_URL;
    await closeDb();
    const raw = JSON.stringify({ id: "WH-2", event_type: "UNKNOWN", resource: {} });
    const sig = signMockWebhook({ transmissionId: "tx-2", transmissionTime: "2026-10-30T12:00:00Z", webhookId: "WHID", rawBody: raw });
    const response = await POST(
      new Request("http://localhost/api/paypal/webhooks", {
        method: "POST",
        body: raw,
        headers: {
          "paypal-transmission-id": "tx-2",
          "paypal-transmission-time": "2026-10-30T12:00:00Z",
          "paypal-transmission-sig": sig,
          "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
          "paypal-auth-algo": "SHA256withRSA",
        },
      }),
    );
    expect(response.status).toBe(200);
  });
});
