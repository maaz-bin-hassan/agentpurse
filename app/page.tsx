import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getDb } from "@/src/db/connection";
import { listHouseholds } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const households = await listHouseholds(await getDb());

  return (
    <main className="shell">
      <SiteHeader aside={<span className="muted hidden sm:inline">Mock mode · no secrets</span>} />
      <p className="eyebrow">PayPal + agents</p>
      <h1 className="mt-2 text-4xl sm:text-6xl">Agents can ask to spend. They cannot be the ones who decide.</h1>
      <hr className="rule" />
      <p className="lede">
        AgentPurse links a person’s PayPal once, gives each agent an allowance, and lets a clerk allow, hold, or deny the purchase in code. PayPal pays the merchant. This app never holds the money.
      </p>
      <div className="actions">
        <Link className="btn no-underline" href="/purses/purse_maya">
          Open Maya’s household
        </Link>
        <Link className="btn secondary no-underline" href="/demo/injection">
          See a blocked injection
        </Link>
      </div>
      <section className="steps">
        <article className="panel">
          <p className="eyebrow">Problem</p>
          <h2>A prompt is not a receipt.</h2>
          <p className="muted">An agent reading a web page can be talked into a different purchase. A balance the app holds is the wrong place for the money.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Solution</p>
          <h2>A purse, then PayPal.</h2>
          <p className="muted">The guard compares the ask to the task. The clerk applies caps. PayPal charges the vaulted wallet and pays the store.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Control</p>
          <h2>A person can still say no.</h2>
          <p className="muted">Above $50, Maya confirms with a passkey or a PayPal link. Pause, revoke, or panic-freeze stops the rest.</p>
        </article>
      </section>
      <section className="panel">
        <h2 className="mt-0">Households</h2>
        {households.length === 0 ? (
          <p>
            No household yet. Run <code>npm run seed</code>, or use Reset demo on the household page after the first seed.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {households.map((owner) => (
              <li key={owner.id} className="border-b border-line py-2">
                <Link href={`/purses/${owner.id}`}>{owner.name}</Link>
                <span className="muted"> · {owner.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
