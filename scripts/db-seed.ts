import { applyMigrations } from "@/src/db/migrations";
import { getIntent, netSpentCents } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";
import { loadHousehold } from "@/src/server/view";
import { countTable, listTables, openCliDatabase } from "./db-cli";

async function main() {
  const sql = await openCliDatabase();
  try {
    const report = await applyMigrations(sql);
    console.log(`migrations applied: ${report.applied.length ? report.applied.join(", ") : "(none)"}`);
    console.log(`migrations already recorded: ${report.skipped.length ? report.skipped.join(", ") : "(none)"}`);
    await seedDemo(sql, { ifMissing: true });
    const household = await loadHousehold(sql, "purse_maya");
    if (!household) throw new Error("Maya's household did not load after seeding.");
    const flight = await getIntent(sql, "intent_skyair");
    if (flight?.status !== "denied" || flight.paypalOrderId) throw new Error("The sample SkyAir flight is not denied.");
    const spent = await netSpentCents(sql, "agent_stack");
    if (spent !== 1200) throw new Error(`Stack's sample receipt is ${spent} cents, expected 1200.`);
    if (household.vault?.status !== "vaulted") throw new Error("Maya's PayPal vault is not linked.");
    if (household.agents.length !== 4) throw new Error(`Expected 4 agents, found ${household.agents.length}.`);
    console.log(`household: ${household.owner.name} (${household.owner.id}), vault ${household.vault.status}, agents ${household.agents.map((agent) => agent.name).join(", ")}`);
    console.log(`sample flight: ${flight.status}; Stack net spend: ${spent} cents`);
    const tables = await listTables(sql);
    console.log("row counts:");
    for (const table of tables) console.log(`  ${table}: ${await countTable(sql, table)}`);
  } finally {
    await sql.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
