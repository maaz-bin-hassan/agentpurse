import { getDb } from "@/src/db/connection";
import { pauseAgent } from "@/src/server/actions";
import { asResponse, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  return asResponse(await pauseAgent(await getDb(), id, body.paused !== false));
}
