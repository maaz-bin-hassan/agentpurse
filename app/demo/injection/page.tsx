import Link from "next/link";
import { InjectionDemo } from "@/components/InjectionDemo";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default function InjectionPage() {
  return (
    <main className="shell">
      <SiteHeader aside={<Link href="/purses/purse_maya">Back to the household</Link>} />
      <p className="eyebrow">Intent guard</p>
      <h1>A page can ask for something else.</h1>
      <hr className="rule" />
      <p className="lede">
        Grocer’s task is oat milk. The page hides a gift-card purchase. The guard compares the proposal to the task and blocks the one the page invented.
      </p>
      <InjectionDemo />
    </main>
  );
}
