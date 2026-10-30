import { getDb } from "@/src/db/connection";
import { actorFromBearer, allowedOrigin, handleMcpMessage } from "@/src/mcp/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function originDenied(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!allowedOrigin(origin)) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Origin is not allowed." } }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = originDenied(request);
  if (denied) return denied;
  return new Response("Streamable HTTP listening is not required. POST JSON-RPC to this URL.", { status: 405 });
}

export async function POST(request: Request) {
  const denied = originDenied(request);
  if (denied) return denied;
  const accept = request.headers.get("accept") ?? "";
  if (accept && !accept.includes("application/json") && !accept.includes("*/*")) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Accept must include application/json." } }, { status: 406 });
  }
  const sql = await getDb();
  const actor = await actorFromBearer(sql, request.headers.get("authorization"));
  if (!actor) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }), {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="agentpurse", resource_metadata="/.well-known/oauth-protected-resource"' },
    });
  }
  const message = (await request.json()) as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  const response = await handleMcpMessage(sql, actor, message);
  if (!response) return new Response(null, { status: 202 });
  return Response.json(response);
}
