import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <main className="shell">
      <SiteHeader />
      <h1>That page is not in the book.</h1>
      <p>
        <Link href="/">Back to the start</Link>
      </p>
    </main>
  );
}
