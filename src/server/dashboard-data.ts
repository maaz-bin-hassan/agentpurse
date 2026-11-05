import type { DashboardData } from "@/components/dashboard/dashboard";
import { channel3Mode, paypalMode } from "@/src/config";
import type { loadHousehold } from "@/src/server/view";

const LINK_NOTICES: Record<string, string> = {
  linked: "PayPal linked. No purchase was made.",
  cancelled: "PayPal linking was cancelled. Nothing changed.",
  failed: "PayPal did not finish linking. Try again from Controls.",
};

type View = NonNullable<Awaited<ReturnType<typeof loadHousehold>>>;

export function dashboardData(view: View, paypal: string | undefined, account: DashboardData["account"] = null): DashboardData {
  return {
    owner: view.owner,
    vault: view.vault ? { status: view.vault.status, paymentTokenId: view.vault.paymentTokenId, payerEmail: view.vault.payerEmail } : null,
    paypalMode: paypalMode(),
    mockCatalog: channel3Mode() === "mock",
    watches: view.watches,
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
    account,
  };
}
