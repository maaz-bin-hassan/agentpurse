"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell">
      <h1>Something went wrong.</h1>
      <p>{error.message || "The purse could not load this page."}</p>
      <button className="btn" type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
