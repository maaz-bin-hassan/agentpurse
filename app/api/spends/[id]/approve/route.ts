import { getIntent } from "@/src/db/repository";
import { approveIntent } from "@/src/server/actions";
import { verifyAuthentication } from "@/src/server/approvals";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const intent = await getIntent(sql, id);
  if (!intent) return asResponse(fail(404, "Unknown intent."));
  const gate = await requireOwner(request, intent.ownerId);
  if (isResponse(gate)) return gate;
  if (!body.credential || typeof body.credential !== "object") {
    return asResponse(fail(401, "Confirm this payment with your passkey, or use the PayPal approval link."));
  }
  try {
    const verified = await verifyAuthentication(gate.sql, intent.ownerId, body.credential as never);
    if (verified.intentId && verified.intentId !== id) return asResponse(fail(401, "This passkey challenge was for a different payment."));
  } catch (error) {
    return asResponse(fail(401, error instanceof Error ? error.message : "Passkey confirmation was rejected."));
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  return asResponse(await approveIntent(gate.sql, id, note, { method: "passkey", webauthnVerified: true }));
}
