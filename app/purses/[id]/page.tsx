import { notFound } from "next/navigation";
import { Dashboard, type DashboardData } from "@/components/dashboard/dashboard";
import { getDb } from "@/src/db/connection";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadHousehold(await getDb(), id);
  if (!view) notFound();
  const data: DashboardData = {
    owner: view.owner,
    vault: view.vault ? { status: view.vault.status, paymentTokenId: view.vault.paymentTokenId } : null,
    agents: view.agents,
    holds: view.holds,
    captured: view.captured,
    intents: view.intents,
    receipts: view.receipts,
    notifications: view.notifications.map((note) => ({
      id: String(note.id),
      title: String(note.title),
      body: String(note.body),
    })),
    latestDetail: view.latest?.detail ?? null,
  };
  return <Dashboard data={data} />;
}
