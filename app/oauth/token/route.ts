import { getDb } from "@/src/db/connection";
import { exchangeCode } from "@/src/oauth/flow";
import { rateLimit } from "@/src/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, 30);
  if (limited) return limited;
  const form = await request.formData();
  try {
    const token = await exchangeCode(await getDb(), {
      code: String(form.get("code") ?? ""),
      verifier: String(form.get("code_verifier") ?? ""),
      redirectUri: String(form.get("redirect_uri") ?? ""),
      clientId: String(form.get("client_id") ?? ""),
    });
    return Response.json(token);
  } catch (error) {
    return Response.json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "rejected" }, { status: 400 });
  }
}
