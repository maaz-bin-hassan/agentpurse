import { applyMigrations } from "@/src/db/migrations";
import { countTable, listTables, openCliDatabase } from "./db-cli";

async function main() {
  const sql = await openCliDatabase();
  try {
    const report = await applyMigrations(sql);
    const tables = await listTables(sql);
    console.log(`applied: ${report.applied.length ? report.applied.join(", ") : "(none)"}`);
    console.log(`already recorded: ${report.skipped.length ? report.skipped.join(", ") : "(none)"}`);
    console.log(`tables: ${tables.join(", ")}`);
    for (const table of tables) {
      console.log(`${table}: ${await countTable(sql, table)}`);
    }
  } finally {
    await sql.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
