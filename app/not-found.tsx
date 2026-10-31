import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <main className="shell">
      <SiteHeader />
      <p className="eyebrow">Missing</p>
      <h1 className="mt-3 text-4xl tracking-[-0.04em]">That page does not exist.</h1>
      <p className="mt-6">
        <Link className="btn no-underline" href="/">Back to the start</Link>
      </p>
    </main>
  );
}
