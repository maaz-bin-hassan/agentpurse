import { getAgent } from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { actorFromBearer } from "@/src/mcp/protocol";
import { DEMO_COOKIE, readDemoSession, signDemoSession } from "@/src/server/demo-session";
import { fail } from "@/src/server/http";

export const DEMO_OWNER_ID = "purse_maya";
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

export async function actorFromRequest(request: Request, sql: Sql): Promise<{ ownerId: string; agentId: string | null } | null> {
  const bearer = await actorFromBearer(sql, request.headers.get("authorization"));
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=([^;]+)`));
  const ownerId = await readDemoSession(match?.[1] ? decodeURIComponent(match[1]) : undefined);
  if (!ownerId) return null;
  return { ownerId, agentId: null };
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
  const actor = await actorFromRequest(request, sql);
  if (!actor) return denied(401, "Sign in, or send a bearer token.");
  if (actor.agentId) return denied(403, "An agent key cannot change the household.");
  if (actor.ownerId !== ownerId) return denied(403, "This household is not yours.");
  return { sql };
}

export async function requireAgent(request: Request, agentId: string): Promise<{ sql: Sql; ownerId: string } | Response> {
  const limited = rateLimit(request);
  if (limited) return limited;
  const { getDb } = await import("@/src/db/connection");
  const sql = await getDb();
  const actor = await actorFromRequest(request, sql);
  if (!actor) return denied(401, "Sign in, or send a bearer token.");
  const agent = await getAgent(sql, agentId);
  if (!agent) return denied(404, "Unknown agent.");
  if (actor.agentId && actor.agentId !== agent.id) return denied(403, "This key is for a different agent.");
  if (actor.ownerId !== agent.ownerId) return denied(403, "This household is not yours.");
  return { sql, ownerId: actor.ownerId };
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
