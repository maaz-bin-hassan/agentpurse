import { getIntent, getPaypalOrder } from "@/src/db/repository";
import { createPayPalClient } from "@/src/paypal";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const order = await getPaypalOrder(sql, id);
  const intent = order?.intentId ? await getIntent(sql, order.intentId) : undefined;
  const ownerId = intent?.ownerId ?? order?.ownerId;
  if (!ownerId) return asResponse(fail(404, "Unknown PayPal order."));
  const gate = await requireOwner(request, ownerId);
  if (isResponse(gate)) return gate;
  try {
    const captured = await createPayPalClient(gate.sql).captureOrder(id);
    return Response.json({ ok: true, order: captured });
  } catch (error) {
    return asResponse(fail(409, error instanceof Error ? error.message : "Could not capture the order."));
  }
}
