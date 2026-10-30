import { getDb } from "@/src/db/connection";
import { registerClient } from "@/src/oauth/flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { client_name?: string; redirect_uris?: string[] };
  const client = await registerClient(await getDb(), {
    clientName: body.client_name || "MCP client",
    redirectUris: body.redirect_uris ?? [],
  });
  return Response.json(client, { status: 201 });
}
