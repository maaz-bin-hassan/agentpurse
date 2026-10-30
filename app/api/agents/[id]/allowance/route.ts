import { getAgent } from "@/src/db/repository";
import { raiseAllowance } from "@/src/server/actions";
import { isResponse, positiveCents, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const amount = positiveCents(body.amountCents);
  if (!amount) return asResponse(fail(400, "Enter a positive whole number of cents."));
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const agent = await getAgent(sql, id);
  if (!agent) return asResponse(fail(404, "Unknown agent."));
  const gate = await requireOwner(request, agent.ownerId);
  if (isResponse(gate)) return gate;
  return asResponse(await raiseAllowance(gate.sql, id, amount));
}
