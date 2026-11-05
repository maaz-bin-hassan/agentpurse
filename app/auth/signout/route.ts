import { NextResponse } from "next/server";
import { routeSupabase } from "@/src/server/supabase-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await routeSupabase();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
