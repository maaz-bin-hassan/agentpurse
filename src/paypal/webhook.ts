import { crc32 } from "node:zlib";

export function webhookMessage(transmissionId: string, transmissionTime: string, webhookId: string, rawBody: string): string {
  const checksum = crc32(Buffer.from(rawBody, "utf8"));
  return `${transmissionId}|${transmissionTime}|${webhookId}|${checksum >>> 0}`;
}
