import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { paypalMode, sandboxDemo, supabaseAuthConfig } from "@/src/config";
import { DEMO_COOKIE, readDemoSession, signDemoSession } from "@/src/server/demo-session";

/** Keeps a Supabase session fresh. Runs only when the browser already holds a Supabase cookie. */
async function refreshAccount(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const config = supabaseAuthConfig();
  const hasSession = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
  if (!config || !hasSession) return response;
  let next = response;
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        const carried = next.cookies.getAll();
        next = NextResponse.next({ request });
        for (const cookie of carried) next.cookies.set(cookie);
        for (const { name, value, options } of list) next.cookies.set(name, value, options);
      },
    },
  });
  await client.auth.getUser();
  return next;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  // The judges' demo: every visitor gets Maaz's demo session in mock mode and on the sandbox demo.
  if ((paypalMode() !== "live" || sandboxDemo()) && (await readDemoSession(request.cookies.get(DEMO_COOKIE)?.value)) !== "purse_maaz") {
    const token = await signDemoSession("purse_maaz");
    if (token) {
      response.cookies.set(DEMO_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }
  return refreshAccount(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)"],
};
