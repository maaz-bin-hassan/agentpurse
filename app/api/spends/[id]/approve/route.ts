import { getDb } from "@/src/db/connection";
import { approveIntent } from "@/src/server/actions";
import { asResponse, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const note = typeof body.note === "string" ? body.note : undefined;
  return asResponse(await approveIntent(await getDb(), id, note, { method: "dashboard" }));
}
