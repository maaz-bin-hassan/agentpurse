import { getIntent, getPaypalOrder } from "@/src/db/repository";
import { finishPaypalApproval } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { getDb } = await import("@/src/db/connection");
  const order = await getPaypalOrder(await getDb(), id);
  const intent = order?.intentId ? await getIntent(await getDb(), order.intentId) : undefined;
  if (!intent) return asResponse(fail(404, "Unknown PayPal order."));
  const gate = await requireOwner(request, intent.ownerId);
  if (isResponse(gate)) return gate;
  return asResponse(await finishPaypalApproval(gate.sql, id));
}
