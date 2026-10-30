import { databasePath } from "@/src/db/connection";
import type { Sql } from "@/src/db/sql";
import { openPostgres, openSqlite } from "@/src/db/sql";

export async function openCliDatabase(): Promise<Sql> {
  if (process.env.DATABASE_URL) {
    console.log("database: postgres");
    return openPostgres(process.env.DATABASE_URL);
  }
  const file = databasePath();
  console.log(`database: sqlite ${file}`);
  return openSqlite(file);
}

export async function listTables(sql: Sql): Promise<string[]> {
  const rows =
    sql.dialect === "postgres"
      ? await sql.all(
          "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
        )
      : await sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rows.map((row) => String(row.name));
}

export async function countTable(sql: Sql, table: string): Promise<number> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`Unexpected table name ${table}`);
  const row = await sql.get(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n ?? 0);
}
