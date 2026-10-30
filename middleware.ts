import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, signDemoSession } from "@/src/server/demo-session";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (process.env.PAYPAL_MODE === "live") return response;
  if (request.cookies.get(DEMO_COOKIE)) return response;
  const token = await signDemoSession("purse_maya");
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
