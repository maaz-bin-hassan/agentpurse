import { healthPayload } from "@/src/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(healthPayload());
}
