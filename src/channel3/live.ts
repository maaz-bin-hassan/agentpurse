import { z } from "zod";
import { centsToDecimal } from "@/src/domain/money";
import {
  Channel3Error,
  priceHistorySchema,
  productSchema,
  searchSchema,
  subscriptionSchema,
  type Channel3Client,
} from "@/src/channel3/types";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const BASE = "https://api.trychannel3.com";

function dollars(cents: number): number {
  return Number(centsToDecimal(cents));
}

export function createLiveChannel3(options: { apiKey: string; baseUrl?: string; fetchImpl?: FetchLike }): Channel3Client {
  const base = (options.baseUrl ?? BASE).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T extends z.ZodTypeAny>(path: string, schema: T, init?: RequestInit & { userId?: string }): Promise<z.output<T>> {
    const headers = new Headers(init?.headers);
    headers.set("x-api-key", options.apiKey);
    if (init?.body) headers.set("content-type", "application/json");
    if (init?.userId) headers.set("x-user-id", init.userId);
    const response = await fetchImpl(`${base}${path}`, { ...init, headers });
    if (response.status === 402) throw new Channel3Error("Channel3 credits have run out.", 402);
    if (response.status === 429) throw new Channel3Error("Channel3 is rate limiting. Try again shortly.", 429);
    if (response.status === 404) throw new Channel3Error("Channel3 could not find that product.", 404);
    if (!response.ok) throw new Channel3Error(`Channel3 request failed (${response.status}).`, 502);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Channel3Error("Channel3 sent a response this app could not read.", 502);
    return parsed.data;
  }

  const filters = (maxPriceCents?: number) => ({
    availability: ["InStock"],
    conditions: ["new"],
    ...(maxPriceCents ? { price: { max_price: dollars(maxPriceCents) } } : {}),
  });

  return {
    mode: "live",
    async search({ query, maxPriceCents, limit = 8, userId }) {
      const body = JSON.stringify({ query, limit, filters: filters(maxPriceCents) });
      return (await call("/v1/search", searchSchema, { method: "POST", body, userId })).products;
    },
    getProduct(productId, userId) {
      return call(`/v1/products/${encodeURIComponent(productId)}`, productSchema, { userId });
    },
    async lookupUrl(url, userId) {
      const wrapped = await call("/v1/lookup", z.object({ product: productSchema }), { method: "POST", body: JSON.stringify({ url }), userId });
      return wrapped.product;
    },
    async similar({ productId, maxPriceCents, limit = 6, userId }) {
      const body = JSON.stringify({ product_id: productId, limit, filters: filters(maxPriceCents) });
      return (await call("/v1/similar", searchSchema, { method: "POST", body, userId })).products;
    },
    priceHistory(productId) {
      return call(`/v0/price-tracking/history/${encodeURIComponent(productId)}`, priceHistorySchema);
    },
    async createSubscription({ productId, domains }) {
      const body = JSON.stringify({ product_id: productId, events: ["offer.price.changed"], domains });
      const created = await call("/v1/product-subscriptions", subscriptionSchema, { method: "POST", body });
      return { subscriptionId: created.subscription_id };
    },
    async cancelSubscription(subscriptionId) {
      await call(`/v1/product-subscriptions/${encodeURIComponent(subscriptionId)}`, subscriptionSchema, { method: "DELETE" });
    },
  };
}
