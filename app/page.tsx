import { LandingExperience } from "@/components/landing/experience";
import { getDb } from "@/src/db/connection";
import { listHouseholds } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const households = await listHouseholds(await getDb());
  return (
    <main>
      <LandingExperience />
      {households.length === 0 ? (
        <p className="mx-auto max-w-6xl px-6 pb-16 text-sm text-[var(--quiet)]">No household yet. Run npm run seed, then reload.</p>
      ) : null}
    </main>
  );
}
