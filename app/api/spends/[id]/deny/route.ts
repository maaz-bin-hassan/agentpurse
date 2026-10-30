import { getIntent } from "@/src/db/repository";
import { denyIntent } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { getDb } = await import("@/src/db/connection");
  const intent = await getIntent(await getDb(), id);
  if (!intent) return asResponse(fail(404, "Unknown intent."));
  const gate = await requireOwner(request, intent.ownerId);
  if (isResponse(gate)) return gate;
  const body = await readJson(request);
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  return asResponse(await denyIntent(gate.sql, id, note));
}
