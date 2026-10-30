import fs from "node:fs";
import path from "node:path";
import { applyMigrations } from "@/src/db/migrations";
import type { Sql } from "@/src/db/sql";

export function loadSchemaSql(): string {
  return fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0002_agentic_commerce.sql"), "utf8");
}

export async function migrate(sql: Sql): Promise<void> {
  if (sql.dialect === "sqlite") {
    const legacy = await sql.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purses'");
    const modern = await sql.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'owners'");
    if (legacy && !modern) {
      await sql.exec("PRAGMA foreign_keys = OFF");
      const tables = await sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
      for (const table of tables) {
        await sql.exec(`DROP TABLE IF EXISTS "${String(table.name).replaceAll('"', "")}"`);
      }
      await sql.exec("PRAGMA foreign_keys = ON");
    }
  }
  await applyMigrations(sql);
}
