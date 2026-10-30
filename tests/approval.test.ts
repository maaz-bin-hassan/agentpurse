import { describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/spends/[id]/approve/route";
import { openDatabase } from "@/src/db/connection";
import { seedDemo } from "@/src/db/seed";
import { approvalPush, verifyAuthentication } from "@/src/server/approvals";
import { beginPaypalApproval, finishPaypalApproval, requestPurchase } from "@/src/server/actions";

const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("approvals", () => {
  it("names the merchant in the push payload and rejects a fake passkey", async () => {
    const { closeDb, getDb } = await import("@/src/db/connection");
    process.env.AGENTPURSE_DB = `/tmp/agentpurse-approval-${process.pid}.db`;
    process.env.AGENTPURSE_AUTO_SEED = "0";
    delete process.env.DATABASE_URL;
    await closeDb();
    const sql = await getDb();
    await seedDemo(sql, { now: NOW });
    const hold = await requestPurchase(sql, "agent_wayfinder", "Hold a $75 seat from Metro Rail", { now: NOW, env: { PAYPAL_MODE: "mock" } });
    if (!hold.body.ok) throw new Error("expected a hold");
    expect(approvalPush(hold.body.intent).body).toContain("$75.00");
    expect(approvalPush(hold.body.intent).title).toContain("Metro Rail");
    await expect(
      verifyAuthentication(sql, "purse_maya", {
        id: "not-a-passkey",
        rawId: "not-a-passkey",
        type: "public-key",
        response: { clientDataJSON: "", authenticatorData: "", signature: "" },
        clientExtensionResults: {},
      }),
    ).rejects.toThrow(/challenge|passkey|Unknown/i);

    const response = await approve(
      new Request("http://localhost/api/spends/x/approve", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: hold.body.intent.id }) },
    );
    expect(response.status).toBe(401);
    await closeDb();
  });

  it("captures after the payer approves the PayPal link", async () => {
    const sql = await openDatabase(":memory:");
    await seedDemo(sql, { now: NOW });
    const hold = await requestPurchase(sql, "agent_wayfinder", "Hold a $75 seat from Metro Rail", { now: NOW, env: { PAYPAL_MODE: "mock" } });
    if (!hold.body.ok) throw new Error("expected a hold");
    const link = await beginPaypalApproval(sql, hold.body.intent.id, { now: NOW });
    expect(link.body.ok).toBe(true);
    if (!link.body.ok) return;
    expect(link.body.paypalUrl).toContain("sandbox.paypal.com");
    const done = await finishPaypalApproval(sql, link.body.orderId, { now: NOW });
    expect(done.body.ok).toBe(true);
    if (!done.body.ok) return;
    expect(done.body.explanation).toContain("Metro Rail");
    await sql.close();
  });
});
