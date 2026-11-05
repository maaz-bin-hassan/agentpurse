import { insertAgent, insertAudit, listAgents, newId } from "@/src/db/repository";
import { buildAgentFromTemplate, MAX_AGENTS_PER_OWNER } from "@/src/domain/templates";
import { isResponse, requireAccount } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates an agent from a template. The API key is returned once and only its hash is stored. */
export async function POST(request: Request) {
  const gate = await requireAccount(request);
  if (isResponse(gate)) return gate;
  const { sql, ownerId } = gate;
  const body = await readJson(request);
  if ((await listAgents(sql, ownerId)).length >= MAX_AGENTS_PER_OWNER) {
    return asResponse(fail(400, `A purse can have up to ${MAX_AGENTS_PER_OWNER} agents. Pause or reuse one.`));
  }
  const built = buildAgentFromTemplate(ownerId, String(body.templateId ?? ""), body.edits ?? {});
  if (!built.ok) return asResponse(fail(400, built.error));
  await insertAgent(sql, built.agent, built.apiKey);
  await insertAudit(sql, {
    id: newId("audit"),
    ownerId,
    actor: "owner",
    action: "agent_created",
    detail: built.agent.policyText ?? `${built.agent.name} created.`,
    createdAt: built.agent.createdAt,
  });
  return Response.json({
    ok: true,
    agent: { id: built.agent.id, name: built.agent.name, provider: built.agent.provider },
    apiKey: built.apiKey,
    explanation: `${built.agent.name} is ready. Copy the key now; it is shown once.`,
  });
}
