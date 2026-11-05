import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAuthConfig } from "@/src/config";
import { getDb } from "@/src/db/connection";
import { ensureAccountOwner, sessionUserFromCookies, type SessionUser } from "@/src/server/session";

/** A Supabase client for route handlers, which may set the refreshed session cookies. */
export async function routeSupabase() {
  const config = supabaseAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options);
      },
    },
  });
}

/** The signed-in user and their purse owner id, for server components. */
export async function currentAccount(): Promise<{ user: SessionUser; ownerId: string } | null> {
  const store = await cookies();
  const user = await sessionUserFromCookies(store.getAll().map(({ name, value }) => ({ name, value })));
  if (!user) return null;
  const ownerId = await ensureAccountOwner(await getDb(), user);
  return { user, ownerId };
}

/** Only same-site paths, so a link cannot bounce a fresh session to another host. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
