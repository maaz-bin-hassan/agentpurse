import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST() {
  return asResponse(
    fail(400, "AgentPurse does not hold PayPal funds. Raise an agent's allowance at POST /api/agents/:id/allowance."),
  );
}
