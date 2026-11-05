import { createServerClient } from "@supabase/ssr";
import { newId, getOwner, insertAccountOwner, ownerIdForAuthUser } from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { supabaseAuthConfig } from "@/src/config";

export type SessionUser = { id: string; email: string; name: string | null };
type CookiePair = { name: string; value: string };
type Resolver = (cookies: CookiePair[]) => Promise<SessionUser | null>;

let override: Resolver | null = null;

/** Tests swap the Supabase lookup for a stub so no network call is made. */
export function setSessionResolverForTests(resolver: Resolver | null): void {
  override = resolver;
}

export function parseCookieHeader(header: string | null): CookiePair[] {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf("=");
      const name = at === -1 ? part : part.slice(0, at);
      const raw = at === -1 ? "" : part.slice(at + 1);
      let value = raw;
      try {
        value = decodeURIComponent(raw);
      } catch {
        value = raw;
      }
      return { name, value };
    });
}

export function hasSupabaseCookie(cookies: CookiePair[]): boolean {
  return cookies.some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

/** Reads the signed-in Supabase user. getUser() asks Supabase to verify the token; the cookie alone is not trusted. */
export async function sessionUserFromCookies(cookies: CookiePair[]): Promise<SessionUser | null> {
  if (override) return override(cookies);
  const config = supabaseAuthConfig();
  if (!config || !hasSupabaseCookie(cookies)) return null;
  const client = createServerClient(config.url, config.key, {
    cookies: { getAll: () => cookies, setAll: () => undefined },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  const meta = data.user.user_metadata as Record<string, unknown> | undefined;
  const name = typeof meta?.name === "string" && meta.name.trim() ? meta.name.trim().slice(0, 60) : null;
  return { id: data.user.id, email: data.user.email, name };
}

/** Finds or creates the purse owner for a signed-in user. */
export async function ensureAccountOwner(sql: Sql, user: SessionUser): Promise<string> {
  const existing = await ownerIdForAuthUser(sql, user.id);
  if (existing) return existing;
  const id = newId("owner");
  try {
    await insertAccountOwner(
      sql,
      { id, name: user.name ?? user.email.split("@")[0], email: user.email, panicFrozen: false, createdAt: new Date().toISOString() },
      user.id,
    );
  } catch (error) {
    // Two first requests can race; the unique index keeps one row.
    const raced = await ownerIdForAuthUser(sql, user.id);
    if (raced) return raced;
    throw error;
  }
  return id;
}

export async function accountOwnerFromCookies(sql: Sql, cookies: CookiePair[]): Promise<string | null> {
  const user = await sessionUserFromCookies(cookies);
  if (!user) return null;
  const ownerId = await ensureAccountOwner(sql, user);
  return (await getOwner(sql, ownerId)) ? ownerId : null;
}
