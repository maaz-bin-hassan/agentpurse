import { requestPurchase } from "@/src/server/actions";
import { boundedText, isResponse, requireAgent } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireAgent(request, id);
  if (isResponse(gate)) return gate;
  const body = await readJson(request);
  const text = boundedText(body.text, 2000);
  if (!text) return asResponse(fail(400, "Write a payment sentence of at most 2000 characters."));
  const originalTask = body.originalTask == null ? undefined : boundedText(body.originalTask, 2000) ?? undefined;
  if (body.originalTask != null && !originalTask) return asResponse(fail(400, "The original task is too long."));
  const pageExcerpt = body.pageExcerpt == null ? undefined : typeof body.pageExcerpt === "string" && body.pageExcerpt.length <= 8000 ? body.pageExcerpt : null;
  if (body.pageExcerpt != null && pageExcerpt == null) return asResponse(fail(400, "The page excerpt is too long."));
  return asResponse(await requestPurchase(gate.sql, id, text, { originalTask, pageExcerpt: pageExcerpt ?? undefined }));
}
