import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "@/src/db/schema";
import { countPurses } from "@/src/db/repository";
import { seedDemo } from "@/src/db/seed";

export type PurseDb = DatabaseSync;

type Cache = { db: PurseDb; filename: string };

const globalForDb = globalThis as unknown as { agentpurse?: Cache };

export function databasePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENTPURSE_DB ?? path.join(process.cwd(), "data", "agentpurse.db");
}

export function openDatabase(filename: string): PurseDb {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  migrate(db);
  return db;
}

export function getDb(env: NodeJS.ProcessEnv = process.env): PurseDb {
  const filename = databasePath(env);
  if (globalForDb.agentpurse && globalForDb.agentpurse.filename !== filename) {
    closeDb();
  }
  if (!globalForDb.agentpurse) {
    const db = openDatabase(filename);
    if (env.AGENTPURSE_AUTO_SEED !== "0" && countPurses(db) === 0) {
      seedDemo(db);
    }
    globalForDb.agentpurse = { db, filename };
  }
  return globalForDb.agentpurse.db;
}

export function closeDb(): void {
  globalForDb.agentpurse?.db.close();
  globalForDb.agentpurse = undefined;
}
