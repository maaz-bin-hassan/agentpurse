import { getDb } from "@/src/db/connection";
import { rateLimit } from "@/src/server/auth";
import { handlePaypalWebhook } from "@/src/server/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, 240);
  if (limited) return limited;
  const rawBody = await request.text();
  if (!request.headers.get("paypal-transmission-id") || !request.headers.get("paypal-transmission-sig")) {
    return Response.json({ ok: false, error: "Missing PayPal transmission headers." }, { status: 400 });
  }
  const result = await handlePaypalWebhook(await getDb(), rawBody, {
    transmissionId: request.headers.get("paypal-transmission-id") ?? "",
    transmissionTime: request.headers.get("paypal-transmission-time") ?? "",
    transmissionSig: request.headers.get("paypal-transmission-sig") ?? "",
    certUrl: request.headers.get("paypal-cert-url") ?? "",
    authAlgo: request.headers.get("paypal-auth-algo") ?? "",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "WHID",
  });
  return Response.json(result.body, { status: result.status });
}
