import { getAgent, insertAudit, newId, rotateAgentKey } from "@/src/db/repository";
import { newAgentKey } from "@/src/domain/templates";
import { isResponse, requireAccount } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Issues a new key for an account's agent. The old key stops working at once. Demo keys never rotate. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireAccount(request);
  if (isResponse(gate)) return gate;
  const agent = await getAgent(gate.sql, id);
  if (!agent || agent.ownerId !== gate.ownerId) return asResponse(fail(404, "Unknown agent."));
  const apiKey = newAgentKey();
  await rotateAgentKey(gate.sql, id, apiKey);
  await insertAudit(gate.sql, {
    id: newId("audit"),
    ownerId: gate.ownerId,
    actor: "owner",
    action: "agent_key_rotated",
    detail: `New key for ${agent.name}. The old key no longer works.`,
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true, apiKey, explanation: `New key for ${agent.name}. The old one stopped working.` });
}
