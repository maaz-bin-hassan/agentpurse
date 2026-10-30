import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireOwner(request, id);
  if (isResponse(gate)) return gate;
  const view = await loadHousehold(gate.sql, id);
  if (!view) return asResponse(fail(404, "Unknown household."));
  return Response.json({ ok: true, ...view });
}
