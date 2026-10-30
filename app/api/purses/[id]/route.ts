import { getDb } from "@/src/db/connection";
import { asResponse, fail } from "@/src/server/http";
import { loadPurseView } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const view = loadPurseView(getDb(), id);
  if (!view) return asResponse(fail(404, "Unknown purse."));
  return Response.json({ ok: true, ...view });
}
