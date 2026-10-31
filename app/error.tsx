"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell">
      <p className="eyebrow">Error</p>
      <h1 className="mt-3 text-4xl tracking-[-0.04em]">Something went wrong.</h1>
      <p className="lede mt-3">{error.message || "The purse could not load this page."}</p>
      <button className="btn" type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
