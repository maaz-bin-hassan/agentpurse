"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

export type AuthMode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<AuthMode, { title: string; lede: string; submit: string }> = {
  login: { title: "Sign in", lede: "Open your purse.", submit: "Sign in" },
  signup: { title: "Create your purse", lede: "Free. Your agents ask, the clerk decides, PayPal pays.", submit: "Create account" },
  forgot: { title: "Reset your password", lede: "We will email you a link.", submit: "Send reset link" },
  reset: { title: "Choose a new password", lede: "At least 10 characters.", submit: "Save password" },
};

export function AuthForm({ mode, config, next }: { mode: AuthMode; config: { url: string; key: string }; next: string }) {
  const supabase = useMemo(() => createBrowserClient(config.url, config.key), [config.url, config.key]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = COPY[mode];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setPending(true);
    setError(null);
    setNotice(null);
    const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;
    try {
      if ((mode === "signup" || mode === "reset") && password.length < 10) throw new Error("Use at least 10 characters for the password.");
      if (mode === "login") {
        const { error: failed } = await supabase.auth.signInWithPassword({ email, password });
        if (failed) throw failed;
        window.location.assign(next);
        return;
      }
      if (mode === "signup") {
        const { data, error: failed } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback("/dashboard"), data: { name } },
        });
        if (failed) throw failed;
        if (data.session) {
          window.location.assign("/dashboard");
          return;
        }
        setNotice(`Check ${email} for a confirmation link. It opens your dashboard.`);
      }
      if (mode === "forgot") {
        const { error: failed } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/reset-password") });
        if (failed) throw failed;
        setNotice(`If ${email} has an account, a reset link is on its way.`);
      }
      if (mode === "reset") {
        const { error: failed } = await supabase.auth.updateUser({ password });
        if (failed) throw failed;
        window.location.assign("/dashboard");
        return;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel">
      <h1 className="text-3xl">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted">{copy.lede}</p>
      <form className="stack mt-5" onSubmit={onSubmit}>
        {mode === "signup" ? (
          <div>
            <label htmlFor="name">Your name</label>
            <input id="name" name="name" autoComplete="name" maxLength={60} required />
          </div>
        ) : null}
        {mode !== "reset" ? (
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
        ) : null}
        {mode !== "forgot" ? (
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 10}
              required
            />
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Working…" : copy.submit}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-deny" role="alert">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {mode === "login" ? (
          <>
            <Link href="/signup">Create an account</Link>
            <Link href="/forgot-password">Forgot password?</Link>
          </>
        ) : null}
        {mode === "signup" || mode === "forgot" ? <Link href="/login">I have an account</Link> : null}
      </div>
    </div>
  );
}
