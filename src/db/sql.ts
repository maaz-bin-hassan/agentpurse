import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface Sql {
  dialect: "sqlite" | "postgres";
  exec(sql: string, params?: SqlValue[]): Promise<void>;
  get(sql: string, params?: SqlValue[]): Promise<SqlRow | undefined>;
  all(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function placeholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function openSqlite(filename: string): Sql {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  let inTx = false;
  const sql: Sql = {
    dialect: "sqlite",
    async exec(statement, params = []) {
      db.prepare(statement).run(...params);
    },
    async get(statement, params = []) {
      return db.prepare(statement).get(...params) as SqlRow | undefined;
    },
    async all(statement, params = []) {
      return db.prepare(statement).all(...params) as unknown as SqlRow[];
    },
    async transaction(fn) {
      if (inTx) return fn(sql);
      inTx = true;
      db.exec("BEGIN IMMEDIATE");
      try {
        const value = await fn(sql);
        db.exec("COMMIT");
        return value;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // already rolled back
        }
        throw error;
      } finally {
        inTx = false;
      }
    },
    async close() {
      db.close();
    },
  };
  return sql;
}

function postgresApi(query: (sql: string, params: SqlValue[]) => Promise<{ rows: SqlRow[] }>, release: () => Promise<void>, inTx: boolean, begin: () => Promise<void>): Sql {
  const sql: Sql = {
    dialect: "postgres",
    async exec(statement, params = []) {
      await query(placeholders(statement), params);
    },
    async get(statement, params = []) {
      const result = await query(placeholders(statement), params);
      return result.rows[0];
    },
    async all(statement, params = []) {
      const result = await query(placeholders(statement), params);
      return result.rows;
    },
    async transaction(fn) {
      if (inTx) return fn(sql);
      await begin();
      const tx = postgresApi(query, async () => undefined, true, async () => undefined);
      try {
        const value = await fn(tx);
        await query("COMMIT", []);
        return value;
      } catch (error) {
        try {
          await query("ROLLBACK", []);
        } catch {
          // already rolled back
        }
        throw error;
      }
    },
    close: release,
  };
  return sql;
}

export async function openPostgres(connectionString: string): Promise<Sql> {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const root = postgresApi(
    async (statement, params) => {
      const result = await pool.query(statement, params);
      return { rows: result.rows as SqlRow[] };
    },
    async () => {
      await pool.end();
    },
    true,
    async () => undefined,
  );
  return {
    ...root,
    async transaction(fn) {
      const client = await pool.connect();
      const tx = postgresApi(
        async (statement, params) => {
          const result = await client.query(statement, params);
          return { rows: result.rows as SqlRow[] };
        },
        async () => undefined,
        true,
        async () => undefined,
      );
      try {
        await client.query("BEGIN");
        const value = await fn(tx);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // already rolled back
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export async function openPglite(): Promise<Sql> {
  const db = new PGlite();
  return postgresApi(
    async (statement, params) => {
      const result = await db.query(statement, params);
      return { rows: result.rows as unknown as SqlRow[] };
    },
    async () => {
      await db.close();
    },
    false,
    async () => {
      await db.exec("BEGIN");
    },
  );
}
