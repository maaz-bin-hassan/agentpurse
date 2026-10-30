import { panicFreeze } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  if (typeof body.frozen !== "boolean") return asResponse(fail(400, "Say whether the panic freeze should be on."));
  const gate = await requireOwner(request, id);
  if (isResponse(gate)) return gate;
  return asResponse(await panicFreeze(gate.sql, id, body.frozen));
}
