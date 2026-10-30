import { getDb } from "@/src/db/connection";
import { newId, saveVault } from "@/src/db/repository";
import { createPayPalClient } from "@/src/paypal";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sql = await getDb();
  const paypal = createPayPalClient(sql);
  const origin = new URL(request.url).origin;
  const setup = await paypal.createSetupToken({
    ownerId: id,
    description: "AgentPurse",
    returnUrl: `${origin}/purses/${id}`,
    cancelUrl: `${origin}/purses/${id}`,
  });
  if (paypal.mode === "live") {
    await saveVault(sql, {
      id: newId("vault"),
      ownerId: id,
      setupTokenId: setup.id,
      paymentTokenId: null,
      paypalCustomerId: setup.customerId ?? null,
      payerEmail: null,
      status: "payer_action_required",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const approve = setup.links.find((link) => link.rel === "approve")?.href ?? "";
    return Response.json({ ok: true, explanation: "Approve the setup token at PayPal. No purchase is made.", approveUrl: approve });
  }
  const approved = await paypal.approveSetupToken(setup.id);
  const token = await paypal.createPaymentToken(approved.id);
  const now = new Date().toISOString();
  await saveVault(sql, {
    id: newId("vault"),
    ownerId: id,
    setupTokenId: setup.id,
    paymentTokenId: token.id,
    paypalCustomerId: token.customerId,
    payerEmail: token.payerEmail ?? null,
    status: "vaulted",
    createdAt: now,
    updatedAt: now,
  });
  return asResponse({ status: 200, body: { ok: true, explanation: `PayPal linked without a purchase. Token ${token.id}.` } });
}
