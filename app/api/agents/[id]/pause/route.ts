import { getAgent } from "@/src/db/repository";
import { pauseAgent } from "@/src/server/actions";
import { isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  if (typeof body.paused !== "boolean") return asResponse(fail(400, "Say whether the agent should be paused."));
  const { getDb } = await import("@/src/db/connection");
  const agent = await getAgent(await getDb(), id);
  if (!agent) return asResponse(fail(404, "Unknown agent."));
  const gate = await requireOwner(request, agent.ownerId);
  if (isResponse(gate)) return gate;
  return asResponse(await pauseAgent(gate.sql, id, body.paused));
}
