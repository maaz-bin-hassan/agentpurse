import { channel3Mode, type AppEnv } from "@/src/config";
import type { Sql } from "@/src/db/sql";
import { createLiveChannel3 } from "@/src/channel3/live";
import { createMockChannel3 } from "@/src/channel3/mock";
import type { Channel3Client } from "@/src/channel3/types";

export function createChannel3Client(sql: Sql, env: AppEnv = process.env): Channel3Client {
  if (channel3Mode(env) === "live" && env.CHANNEL3_API_KEY) {
    return createLiveChannel3({ apiKey: env.CHANNEL3_API_KEY, baseUrl: env.CHANNEL3_API_BASE });
  }
  return createMockChannel3(sql);
}

export { Channel3Error, priceToCents } from "@/src/channel3/types";
export type { Channel3Client, Channel3Offer, Channel3Product, PriceHistory } from "@/src/channel3/types";
