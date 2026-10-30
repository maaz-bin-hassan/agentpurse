import type { DatabaseSync } from "node:sqlite";

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The connection may already have rolled back.
    }
    throw error;
  }
}

export async function transactionAsync<T>(db: DatabaseSync, fn: () => Promise<T>): Promise<T> {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = await fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The connection may already have rolled back.
    }
    throw error;
  }
}
