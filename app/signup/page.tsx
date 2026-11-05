import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Create your purse · AgentPurse" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthPage mode="signup" next={next} />;
}
