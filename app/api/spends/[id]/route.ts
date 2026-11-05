import { getIntent } from "@/src/db/repository";
import { publicBase } from "@/src/oauth/metadata";
import { actorFromRequest, rateLimit } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read-only status for a held or settled cheque.
 * Hermes polls this after AgentPurse asks for a passkey. It does not approve, deny, or pay.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const { id } = await context.params;
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const actor = await actorFromRequest(request, sql);
  if (!actor) return asResponse(fail(401, "Sign in, or send a bearer token."));
  const intent = await getIntent(sql, id);
  if (!intent || intent.ownerId !== actor.ownerId) return asResponse(fail(404, "Unknown payment."));
  if (actor.agentId && actor.agentId !== intent.agentId) return asResponse(fail(404, "Unknown payment."));
  const url = new URL(`/purses/${encodeURIComponent(intent.ownerId)}`, `${publicBase()}/`);
  url.searchParams.set("hold", intent.id);
  return asResponse({
    status: 200,
    body: {
      ok: true,
      approvalUrl: url.toString(),
      intent: {
        id: intent.id,
        status: intent.status,
        merchantName: intent.merchantName,
        amountCents: intent.amountCents,
        currency: intent.currency,
        decision: intent.decision,
        guardDecision: intent.guardDecision,
        explanation: intent.explanation,
        paypalOrderId: intent.paypalOrderId,
        captureId: intent.captureId,
        updatedAt: intent.updatedAt,
      },
    },
  });
}
