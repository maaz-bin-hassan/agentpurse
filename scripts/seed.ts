import { getDb } from "@/src/db/connection";
import { DEMO_KEYS, DEMO_OWNER_ID, seedDemo } from "@/src/db/seed";

const sql = await getDb();
await seedDemo(sql);
console.log(`Seeded ${DEMO_OWNER_ID}. Allowances are ledger caps. PayPal is not holding a balance.`);
console.log(`Open http://localhost:3000/purses/${DEMO_OWNER_ID}`);
for (const [agentId, key] of Object.entries(DEMO_KEYS)) {
  console.log(`${agentId} API key: ${key}`);
}
