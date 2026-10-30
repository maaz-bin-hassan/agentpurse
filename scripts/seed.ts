import { getDb } from "@/src/db/connection";
import { DEMO_PURSE_ID, seedDemo } from "@/src/db/seed";

const result = seedDemo(getDb(), { now: new Date() });
console.log(`Seeded ${result.purseId} with balance ${result.balanceCents} cents.`);
console.log(`Open http://localhost:3000/purses/${DEMO_PURSE_ID}`);
