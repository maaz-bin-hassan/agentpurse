import { formatMoney } from "@/src/domain/money";
import {
  getOwner,
  getVault,
  listAgents,
  listAudit,
  listIntents,
  listNotifications,
  listReceipts,
  netSpentCents,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";

export async function loadHousehold(sql: Sql, ownerId: string) {
  const owner = await getOwner(sql, ownerId);
  if (!owner) return null;
  const agents = await Promise.all(
    (await listAgents(sql, ownerId)).map(async (agent) => {
      const spentCents = await netSpentCents(sql, agent.id);
      return { ...agent, spentCents, remainingCents: agent.allowanceCents - spentCents };
    }),
  );
  const intents = await listIntents(sql, ownerId);
  const receipts = await listReceipts(sql, ownerId);
  const audit = await listAudit(sql, ownerId);
  return {
    owner,
    vault: (await getVault(sql, ownerId)) ?? null,
    agents,
    holds: intents.filter((intent) => intent.status === "pending_approval"),
    captured: intents.filter((intent) => intent.status === "captured"),
    intents,
    receipts,
    notifications: await listNotifications(sql, ownerId),
    latest: audit[0] ?? null,
    allowanceLabel: (cents: number) => formatMoney(cents),
  };
}

export async function listHouseholds(sql: Sql) {
  const { listAllAgents, countOwners } = await import("@/src/db/repository");
  void listAllAgents;
  void countOwners;
  const rows = await sqlAllOwners(sql);
  return rows;
}

async function sqlAllOwners(sql: Sql) {
  const { getOwner } = await import("@/src/db/repository");
  const ids = await sql.all("SELECT id FROM owners ORDER BY created_at ASC");
  const owners = [];
  for (const row of ids) {
    const owner = await getOwner(sql, String(row.id));
    if (owner) owners.push(owner);
  }
  return owners;
}
