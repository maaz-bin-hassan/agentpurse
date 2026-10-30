import { getDb } from "@/src/db/connection";
import { requestPurchase } from "@/src/server/actions";
import { asResponse, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const text = typeof body.text === "string" ? body.text : "";
  const originalTask = typeof body.originalTask === "string" ? body.originalTask : undefined;
  const pageExcerpt = typeof body.pageExcerpt === "string" ? body.pageExcerpt : undefined;
  return asResponse(await requestPurchase(await getDb(), id, text, { originalTask, pageExcerpt }));
}
