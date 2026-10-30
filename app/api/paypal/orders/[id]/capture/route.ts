import { getDb } from "@/src/db/connection";
import { createPayPalClient } from "@/src/paypal";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const order = await createPayPalClient(await getDb()).captureOrder(id);
    return Response.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not capture the order.";
    return asResponse(fail(409, message));
  }
}
