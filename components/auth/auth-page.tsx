import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm, type AuthMode } from "@/components/auth/auth-form";
import { SiteHeader } from "@/components/site-header";
import { supabaseAuthConfig } from "@/src/config";
import { currentAccount, safeNext } from "@/src/server/supabase-next";

export async function AuthPage({ mode, next }: { mode: AuthMode; next?: string }) {
  const config = supabaseAuthConfig();
  if (config && mode !== "reset" && (await currentAccount())) redirect(safeNext(next));
  return (
    <main className="shell">
      <SiteHeader />
      <div className="mx-auto max-w-md">
        {config ? (
          <AuthForm mode={mode} config={config} next={safeNext(next)} />
        ) : (
          <div className="panel">
            <h1 className="text-3xl">Accounts are off here</h1>
            <p className="mt-2 text-sm text-muted">
              This copy runs without Supabase. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to turn on sign-up.
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          New to AgentPurse? <Link href="/#video">Watch the demo video</Link> or <Link href="/tutorial">read the tutorial</Link>.
        </p>
      </div>
    </main>
  );
}
