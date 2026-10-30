import { getDb } from "@/src/db/connection";
import { registerClient } from "@/src/oauth/flow";
import { rateLimit } from "@/src/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, 20);
  if (limited) return limited;
  const body = (await request.json()) as { client_name?: string; redirect_uris?: string[] };
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0 || body.redirect_uris.length > 5) {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const client = await registerClient(await getDb(), {
    clientName: body.client_name || "MCP client",
    redirectUris: body.redirect_uris ?? [],
  });
  return Response.json(client, { status: 201 });
}
