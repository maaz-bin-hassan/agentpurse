import { getDb } from "@/src/db/connection";
import { beginPaypalApproval } from "@/src/server/actions";
import { asResponse } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return asResponse(await beginPaypalApproval(await getDb(), id));
}
