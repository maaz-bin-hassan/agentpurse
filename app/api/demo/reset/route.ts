import { paypalMode, sandboxDemo } from "@/src/config";
import { getVault, saveVault } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";
import { DEMO_OWNER_ID, isResponse, requireOwner } from "@/src/server/auth";
import { asResponse, fail } from "@/src/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const sandbox = sandboxDemo();
  if (paypalMode() === "live" && !sandbox) {
    return asResponse(fail(403, "Reset demo is only available in mock mode or the sandbox demo."));
  }
  const gate = await requireOwner(request, DEMO_OWNER_ID);
  if (isResponse(gate)) return gate;
  const vault = sandbox ? await getVault(gate.sql, DEMO_OWNER_ID) : undefined;
  await seedDemo(gate.sql);
  const keptWallet = Boolean(vault?.paymentTokenId && !vault.paymentTokenId.startsWith("VAULT-MOCK"));
  if (vault && keptWallet) await saveVault(gate.sql, vault);
  const explanation = !sandbox
    ? "Maya's household was restored. Allowances, the vault, and the sample receipt are back."
    : keptWallet
      ? "Maya's ledger was restored. The linked PayPal wallet stays linked."
      : "Maya's ledger was restored. Click Link PayPal to connect a sandbox wallet.";
  return asResponse({ status: 200, body: { ok: true, explanation } });
}
