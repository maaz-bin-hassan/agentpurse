import { getDb } from "@/src/db/connection";
import { createTopup } from "@/src/server/actions";
import { asResponse, readJson } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const amountCents = Number(body.amountCents);
  return asResponse(await createTopup(getDb(), id, amountCents));
}
