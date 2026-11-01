import { NextResponse, type NextRequest } from "next/server";
import { paypalMode, sandboxDemo } from "@/src/config";
import { DEMO_COOKIE, readDemoSession, signDemoSession } from "@/src/server/demo-session";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (paypalMode() === "live" && !sandboxDemo()) return response;
  if ((await readDemoSession(request.cookies.get(DEMO_COOKIE)?.value)) === "purse_maaz") return response;
  const token = await signDemoSession("purse_maaz");
  if (!token) return response;
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)"],
};
