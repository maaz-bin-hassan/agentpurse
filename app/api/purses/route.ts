import { getDb } from "@/src/db/connection";
import { actorFromRequest, rateLimit } from "@/src/server/auth";
import { listHouseholds } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const sql = await getDb();
  const actor = await actorFromRequest(request, sql);
  if (!actor) return Response.json({ ok: false, error: "Sign in, or send a bearer token." }, { status: 401 });
  const households = (await listHouseholds(sql)).filter((owner) => owner.id === actor.ownerId);
  return Response.json({ ok: true, purses: households });
}
