import { finishVaultLink } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("owner") ?? "";
  const gate = await requireOwner(request, ownerId);
  if (isResponse(gate)) return gate;
  const back = (state: string) => Response.redirect(new URL(`/purses/${encodeURIComponent(ownerId)}?paypal=${state}`, url), 303);
  if (url.searchParams.get("cancelled")) return back("cancelled");
  const linked = await finishVaultLink(gate.sql, ownerId);
  return back(linked.body.ok ? "linked" : "failed");
}
