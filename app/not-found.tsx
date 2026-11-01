import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <main className="shell">
      <SiteHeader />
      <span className="stamp large deny">Void</span>
      <h1 className="mt-5 text-4xl">That page is not in the book.</h1>
      <p className="mt-3">
        <Link className="underline" href="/">Back to the start</Link>
      </p>
    </main>
  );
}
