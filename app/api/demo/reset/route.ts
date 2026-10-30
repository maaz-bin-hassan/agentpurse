import { seedDemo } from "@/src/db/seed";
import { DEMO_OWNER_ID, isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.PAYPAL_MODE === "live") {
    return asResponse(fail(403, "Reset demo is only available while PAYPAL_MODE=mock."));
  }
  const gate = await requireOwner(request, DEMO_OWNER_ID);
  if (isResponse(gate)) return gate;
  await seedDemo(gate.sql);
  return asResponse({ status: 200, body: { ok: true, explanation: "Maya's household was restored. Allowances, the vault, and the sample receipt are back." } });
}
