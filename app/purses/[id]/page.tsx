import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getDb } from "@/src/db/connection";
import { DEMO_OWNER_ID } from "@/src/db/seed";
import { dashboardData } from "@/src/server/dashboard-data";
import { currentAccount } from "@/src/server/supabase-next";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paypal?: string }>;
}) {
  const { id } = await params;
  const { paypal } = await searchParams;
  // Only the judges' demo purse is public. Account purses live at /dashboard behind sign-in.
  if (id !== DEMO_OWNER_ID) {
    const account = await currentAccount();
    if (account?.ownerId === id) redirect(paypal ? `/dashboard?paypal=${encodeURIComponent(paypal)}` : "/dashboard");
    notFound();
  }
  const view = await loadHousehold(await getDb(), id);
  if (!view) notFound();
  return <Dashboard data={dashboardData(view, paypal)} />;
}
