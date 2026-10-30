import { getDb } from "@/src/db/connection";
import { listPurseSummaries } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json({ ok: true, purses: listPurseSummaries(getDb()) });
}
