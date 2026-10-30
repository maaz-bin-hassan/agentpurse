import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <h1>That page is not in the book.</h1>
      <p>
        <Link href="/">Back to the purses</Link>
      </p>
    </main>
  );
}
