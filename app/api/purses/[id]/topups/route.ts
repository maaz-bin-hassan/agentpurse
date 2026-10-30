import { rateLimit } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return asResponse(
    fail(400, "AgentPurse does not hold PayPal funds. Raise an agent's allowance at POST /api/agents/:id/allowance."),
  );
}
