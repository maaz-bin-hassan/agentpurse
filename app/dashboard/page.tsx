import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { publicBaseUrl, supabaseAuthConfig } from "@/src/config";
import { getDb } from "@/src/db/connection";
import { AGENT_TEMPLATES } from "@/src/domain/templates";
import { dashboardData } from "@/src/server/dashboard-data";
import { currentAccount } from "@/src/server/supabase-next";
import { loadHousehold } from "@/src/server/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Dashboard · AgentPurse" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ paypal?: string }> }) {
  if (!supabaseAuthConfig()) redirect("/login");
  const account = await currentAccount();
  if (!account) redirect("/login?next=/dashboard");
  const { paypal } = await searchParams;
  const view = await loadHousehold(await getDb(), account.ownerId);
  if (!view) notFound();
  const head = await headers();
  const origin = `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host") ?? "localhost:3000"}`;
  return (
    <Dashboard
      data={dashboardData(view, paypal, {
        email: account.user.email,
        mcpUrl: `${publicBaseUrl(origin)}/mcp`,
        templates: [...AGENT_TEMPLATES],
      })}
    />
  );
}
