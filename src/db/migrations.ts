import fs from "node:fs";
import path from "node:path";
import type { Sql } from "@/src/db/sql";

export type MigrationReport = {
  applied: string[];
  skipped: string[];
};

export function migrationsDir(): string {
  return path.join(process.cwd(), "supabase", "migrations");
}

export function listMigrationFiles(dir = migrationsDir()): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

export function splitSql(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "-" && next === "-") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      const statement = current.trim();
      if (statement.length > 0) statements.push(statement);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

export async function applyMigrations(sql: Sql, dir = migrationsDir()): Promise<MigrationReport> {
  await sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of listMigrationFiles(dir)) {
    const version = file.replace(/\.sql$/, "");
    const existing = await sql.get("SELECT version FROM schema_migrations WHERE version = ?", [version]);
    if (existing) {
      skipped.push(version);
      continue;
    }
    const statements = splitSql(fs.readFileSync(path.join(dir, file), "utf8"));
    const appliedAt = new Date().toISOString();
    await sql.transaction(async (tx) => {
      for (const statement of statements) await tx.exec(statement);
      await tx.exec("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [version, appliedAt]);
    });
    applied.push(version);
  }
  return { applied, skipped };
}
