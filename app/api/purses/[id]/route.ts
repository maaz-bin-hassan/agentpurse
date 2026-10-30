import { getDb } from "@/src/db/connection";
import { asResponse, fail } from "@/src/server/http";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const view = await loadHousehold(await getDb(), id);
  if (!view) return asResponse(fail(404, "Unknown household."));
  return Response.json({ ok: true, ...view });
}
