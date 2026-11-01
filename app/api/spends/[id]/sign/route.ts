import { dashboardSignatureAllowed } from "@/src/config";
import { getIntent } from "@/src/db/repository";
import { approveIntent } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* The owner signs a held cheque from the dashboard. requireOwner refuses agent keys, so an agent cannot sign for itself. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const { getDb } = await import("@/src/db/connection");
  const intent = await getIntent(await getDb(), id);
  if (!intent) return asResponse(fail(404, "Unknown intent."));
  const gate = await requireOwner(request, intent.ownerId);
  if (isResponse(gate)) return gate;
  if (!dashboardSignatureAllowed()) return asResponse(fail(401, "Confirm this payment with your passkey."));
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  return asResponse(await approveIntent(gate.sql, id, note, { method: "dashboard" }));
}
