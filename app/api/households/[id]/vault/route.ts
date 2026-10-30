import { newId, saveVault } from "@/src/db/repository";
import { createPayPalClient } from "@/src/paypal";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireOwner(request, id);
  if (isResponse(gate)) return gate;
  const { sql } = gate;
  const paypal = createPayPalClient(sql);
  const origin = new URL(request.url).origin;
  const setup = await paypal.createSetupToken({
    ownerId: id,
    description: "AgentPurse",
    returnUrl: `${origin}/purses/${id}`,
    cancelUrl: `${origin}/purses/${id}`,
  });
  const now = new Date().toISOString();
  if (paypal.mode === "live") {
    await saveVault(sql, {
      id: newId("vault"),
      ownerId: id,
      setupTokenId: setup.id,
      paymentTokenId: null,
      paypalCustomerId: setup.customerId ?? null,
      payerEmail: null,
      status: "payer_action_required",
      createdAt: now,
      updatedAt: now,
    });
    const approve = setup.links.find((link) => link.rel === "approve")?.href ?? "";
    return Response.json({ ok: true, explanation: "Approve the setup token at PayPal. No purchase is made.", approveUrl: approve });
  }
  const approved = await paypal.approveSetupToken(setup.id);
  const token = await paypal.createPaymentToken(approved.id);
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
