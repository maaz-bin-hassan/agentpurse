"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell">
      <h1 className="text-4xl">Something went wrong.</h1>
      <p className="muted mt-3">{error.message || "The purse could not load this page."}</p>
      <button className="btn mt-5" type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
