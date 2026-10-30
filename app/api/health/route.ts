import { healthPayload } from "@/src/config";
import { rateLimit } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return Response.json(healthPayload());
}
