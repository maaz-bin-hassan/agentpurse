import { notFound } from "next/navigation";
import { Dashboard, type DashboardData } from "@/components/dashboard/dashboard";
import { paypalMode } from "@/src/config";
import { getDb } from "@/src/db/connection";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LINK_NOTICES: Record<string, string> = {
  linked: "PayPal linked. No purchase was made.",
  cancelled: "PayPal linking was cancelled. Nothing changed.",
  failed: "PayPal did not finish linking. Try again from Controls.",
};

export default async function PursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paypal?: string }>;
}) {
  const { id } = await params;
  const { paypal } = await searchParams;
  const view = await loadHousehold(await getDb(), id);
  if (!view) notFound();
  const data: DashboardData = {
    owner: view.owner,
    vault: view.vault ? { status: view.vault.status, paymentTokenId: view.vault.paymentTokenId, payerEmail: view.vault.payerEmail } : null,
    paypalMode: paypalMode(),
    linkNotice: (paypal && LINK_NOTICES[paypal]) || null,
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
