import { getDb } from "@/src/db/connection";
import { rateLimit } from "@/src/server/auth";
import { handleChannel3Webhook } from "@/src/server/watches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, 240);
  if (limited) return limited;
  const secret = process.env.CHANNEL3_WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, error: "Channel3 webhooks are not set up." }, { status: 503 });
  const rawBody = await request.text();
  const result = await handleChannel3Webhook(
    await getDb(),
    rawBody,
    {
      id: request.headers.get("svix-id") ?? "",
      timestamp: request.headers.get("svix-timestamp") ?? "",
      signature: request.headers.get("svix-signature") ?? "",
    },
    { secret },
  );
  return Response.json(result.body, { status: result.status });
}
