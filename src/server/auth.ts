import { getAgent } from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { actorFromBearer } from "@/src/mcp/protocol";
import { DEMO_COOKIE, readDemoSession, signDemoSession } from "@/src/server/demo-session";
import { fail } from "@/src/server/http";
import { accountOwnerFromCookies, parseCookieHeader } from "@/src/server/session";

export const DEMO_OWNER_ID = "purse_maaz";
export { DEMO_COOKIE, signDemoSession };

const buckets = new Map<string, { count: number; reset: number }>();

export async function demoCookieHeader(ownerId = DEMO_OWNER_ID): Promise<string> {
  const token = await signDemoSession(ownerId);
  return `${DEMO_COOKIE}=${token}`;
}

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimit(request: Request, limit = 120): Response | null {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return Response.json({ ok: false, error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: { "retry-after": "60" } });
}

export function resetRateLimits(): void {
  buckets.clear();
}

type Actor = { ownerId: string; agentId: string | null };

/** Who this request may act as: an agent key alone, or a signed-in account plus the demo session. */
export async function actorsFromRequest(request: Request, sql: Sql): Promise<Actor[]> {
  const bearer = await actorFromBearer(sql, request.headers.get("authorization"));
  if (bearer) return [bearer];
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const actors: Actor[] = [];
  const account = await accountOwnerFromCookies(sql, cookies);
  if (account) actors.push({ ownerId: account, agentId: null });
  const demo = await readDemoSession(cookies.find((cookie) => cookie.name === DEMO_COOKIE)?.value);
  if (demo && demo !== account) actors.push({ ownerId: demo, agentId: null });
  return actors;
}

export async function actorFromRequest(request: Request, sql: Sql): Promise<Actor | null> {
  return (await actorsFromRequest(request, sql))[0] ?? null;
}

function denied(status: number, error: string): Response {
  const result = fail(status, error);
  const headers = status === 401 ? { "www-authenticate": 'Bearer realm="agentpurse"' } : undefined;
  return Response.json(result.body, { status, headers });
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function requireOwner(request: Request, ownerId: string): Promise<{ sql: Sql } | Response> {
  const limited = rateLimit(request);
  if (limited) return limited;
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const actors = await actorsFromRequest(request, sql);
  if (actors.length === 0) return denied(401, "Sign in, or send a bearer token.");
  if (actors[0].agentId) return denied(403, "An agent key cannot change the household.");
  if (!actors.some((actor) => actor.ownerId === ownerId)) return denied(403, "This household is not yours.");
  return { sql };
}

/** A signed-in account only. The demo session and agent keys are refused. */
export async function requireAccount(request: Request): Promise<{ sql: Sql; ownerId: string } | Response> {
  const limited = rateLimit(request, 60);
  if (limited) return limited;
  if (request.headers.get("authorization")) return denied(403, "Sign in to your account to do this.");
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const ownerId = await accountOwnerFromCookies(sql, parseCookieHeader(request.headers.get("cookie")));
  if (!ownerId) return denied(401, "Sign in to your account to do this.");
  return { sql, ownerId };
}

export async function requireAgent(request: Request, agentId: string): Promise<{ sql: Sql; ownerId: string } | Response> {
  const limited = rateLimit(request);
  if (limited) return limited;
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const actors = await actorsFromRequest(request, sql);
  if (actors.length === 0) return denied(401, "Sign in, or send a bearer token.");
  const agent = await getAgent(sql, agentId);
  if (!agent) return denied(404, "Unknown agent.");
  if (actors[0].agentId && actors[0].agentId !== agent.id) return denied(403, "This key is for a different agent.");
  if (!actors.some((actor) => actor.ownerId === agent.ownerId)) return denied(403, "This household is not yours.");
  return { sql, ownerId: agent.ownerId };
}

export function positiveCents(value: unknown, max = 100_000_000): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(amount) || amount <= 0 || amount > max) return null;
  return amount;
}

export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}
