import { boundedText, isResponse, positiveCents, requireOwner } from "@/src/server/auth";
import { asResponse, fail, readJson } from "@/src/server/http";
import { buyProduct, checkPrice, findAlternatives, productDetail, searchCatalog } from "@/src/server/shop";
import { cancelWatch, checkWatchNow, createWatch, simulateDrop } from "@/src/server/watches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await requireOwner(request, id);
  if (isResponse(gate)) return gate;
  const { sql } = gate;
  const body = await readJson(request);
  const action = body.action;
  const productId = boundedText(body.productId, 200);
  const domain = boundedText(body.domain, 200);
  const originalTask = boundedText(body.originalTask, 2000);
  const watchId = boundedText(body.watchId, 200);
  const maxPriceCents = body.maxPriceCents == null ? undefined : positiveCents(body.maxPriceCents) ?? undefined;

  if (action === "search") {
    const query = boundedText(body.query, 300);
    if (!query) return asResponse(fail(400, "Write what to look for."));
    return asResponse(await searchCatalog(sql, id, { query, maxPriceCents }));
  }
  if (action === "lookup") return asResponse(await productDetail(sql, id, { url: boundedText(body.url, 2000) ?? undefined }));
  if (action === "price" && productId) return asResponse(await checkPrice(sql, productId));
  if (action === "alternatives" && productId) return asResponse(await findAlternatives(sql, id, { productId, maxPriceCents }));
  if (action === "buy" && productId && domain && originalTask) return asResponse(await buyProduct(sql, { ownerId: id, productId, domain, originalTask }));
  if (action === "watch" && productId && domain && originalTask) {
    const targetCents = positiveCents(body.targetCents);
    if (!targetCents) return asResponse(fail(400, "Set a target price."));
    return asResponse(await createWatch(sql, { ownerId: id, productId, domain, targetCents, originalTask }));
  }
  if (action === "cancel_watch" && watchId) return asResponse(await cancelWatch(sql, id, watchId));
  if (action === "check_watch" && watchId) return asResponse(await checkWatchNow(sql, id, watchId));
  if (action === "simulate_drop" && watchId) return asResponse(await simulateDrop(sql, id, watchId));
  return asResponse(fail(400, "That shop action is missing something."));
}
