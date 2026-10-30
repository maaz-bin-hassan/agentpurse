import { getDb } from "@/src/db/connection";
import { listHouseholds } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const households = await listHouseholds(await getDb());
  return Response.json({ ok: true, purses: households });
}
