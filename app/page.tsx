import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Agent<span>Purse</span>
        </Link>
        <p className="muted" style={{ margin: 0 }}>
          PayPal mock mode
        </p>
      </header>
      <p className="eyebrow">A checkbook for agents</p>
      <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 4.6rem)", margin: "8px 0 0" }}>
        The purse your agents spend from.
      </h1>
      <hr className="rule" />
      <p className="lede">
        An agent asks in a sentence. The purse clerk allows it, holds it for a human, or
        says no. PayPal moves the money only after the clerk agrees. Nothing here needs a
        sandbox key.
      </p>
      <p className="muted">
        The household ledger lands on this page in phase 6. Until then,{" "}
        <Link href="/api/health">/api/health</Link> reports the modes.
      </p>
    </main>
  );
}
