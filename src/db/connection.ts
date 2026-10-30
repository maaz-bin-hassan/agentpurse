import path from "node:path";
import { countOwners } from "@/src/db/repository";
import { migrate } from "@/src/db/schema";
import { seedDemo } from "@/src/db/seed";
import { openPostgres, openSqlite, type Sql } from "@/src/db/sql";

type Cache = { sql: Sql; key: string };

const globalForDb = globalThis as unknown as { agentpurseSql?: Cache };

export function databasePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENTPURSE_DB ?? path.join(process.cwd(), "data", "agentpurse.db");
}

export function databaseKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL ? `pg:${env.DATABASE_URL}` : `sqlite:${databasePath(env)}`;
}

export async function openDatabase(filename = ":memory:"): Promise<Sql> {
  const sql = openSqlite(filename);
  await migrate(sql);
  return sql;
}

export async function getDb(env: NodeJS.ProcessEnv = process.env): Promise<Sql> {
  const key = databaseKey(env);
  if (globalForDb.agentpurseSql && globalForDb.agentpurseSql.key !== key) {
    await closeDb();
  }
  if (!globalForDb.agentpurseSql) {
    const sql = env.DATABASE_URL ? await openPostgres(env.DATABASE_URL) : openSqlite(databasePath(env));
    await migrate(sql);
    if (env.AGENTPURSE_AUTO_SEED !== "0" && (await countOwners(sql)) === 0) {
      await seedDemo(sql);
    }
    globalForDb.agentpurseSql = { sql, key };
  }
  return globalForDb.agentpurseSql.sql;
}

export async function closeDb(): Promise<void> {
  await globalForDb.agentpurseSql?.sql.close();
  globalForDb.agentpurseSql = undefined;
}
