import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { routeSupabase, safeNext } from "@/src/server/supabase-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Email confirmation and password reset links land here and become a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await routeSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/login", url), 303);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };
  if (error) return NextResponse.redirect(new URL("/login?error=link", url), 303);
  return NextResponse.redirect(new URL(next, url), 303);
}
