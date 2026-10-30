import { revokeVault } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireOwner(request, id);
  if (isResponse(gate)) return gate;
  return asResponse(await revokeVault(gate.sql, id));
}
