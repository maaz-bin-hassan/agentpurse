import { z } from "zod";
import { decimalToCents } from "@/src/domain/money";

const price = z
  .object({
    price: z.number().optional(),
    amount: z.number().optional(),
    currency: z.string(),
    compare_at_price: z.number().nullish(),
  })
  .transform((value, context) => {
    const current = value.price ?? value.amount;
    if (current == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Offer has no price." });
      return z.NEVER;
    }
    return { price: current, currency: value.currency, compareAtPrice: value.compare_at_price ?? null };
  });

const offer = z.object({
  url: z.string(),
  domain: z.string(),
  price,
  availability: z.string(),
  condition: z.string().nullish(),
  max_commission_rate: z.number().nullish(),
});

export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  brands: z.array(z.object({ id: z.string().optional(), name: z.string() })).nullish(),
  images: z.array(z.object({ url: z.string(), is_main_image: z.boolean().nullish() })).nullish(),
  category: z.object({ slug: z.string(), title: z.string(), path: z.array(z.object({ slug: z.string(), title: z.string() })).nullish() }).nullish(),
  offers: z.array(offer).nullish().transform((value) => value ?? []),
  ratings: z.object({ value: z.number(), count: z.number() }).nullish(),
});

const historyPoint = z.object({ timestamp: z.string(), price: z.number(), currency: z.string() });

export const priceHistorySchema = z
  .object({
    canonical_product_id: z.string(),
    product_title: z.string().nullish(),
    history: z.array(historyPoint).optional(),
    price_history: z.array(historyPoint).optional(),
    statistics: z
      .object({
        mean: z.number(),
        min_price: z.number(),
        max_price: z.number(),
        current_price: z.number(),
        current_status: z.enum(["low", "typical", "high"]),
        currency: z.string(),
      })
      .nullish(),
  })
  .transform((value) => ({
    productId: value.canonical_product_id,
    points: value.history ?? value.price_history ?? [],
    statistics: value.statistics ?? null,
  }));

export const searchSchema = z.object({ products: z.array(productSchema), next_page_token: z.string().nullish() });
export const subscriptionSchema = z.object({ subscription_id: z.string(), status: z.string() });

export type Channel3Product = z.infer<typeof productSchema>;
export type Channel3Offer = Channel3Product["offers"][number];
export type PriceHistory = z.infer<typeof priceHistorySchema>;

export interface Channel3Client {
  readonly mode: "mock" | "live";
  search(input: { query: string; maxPriceCents?: number; limit?: number; userId?: string }): Promise<Channel3Product[]>;
  getProduct(productId: string, userId?: string): Promise<Channel3Product>;
  lookupUrl(url: string, userId?: string): Promise<Channel3Product>;
  similar(input: { productId: string; maxPriceCents?: number; limit?: number; userId?: string }): Promise<Channel3Product[]>;
  priceHistory(productId: string): Promise<PriceHistory>;
  createSubscription(input: { productId: string; domains: string[] }): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export class Channel3Error extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "Channel3Error";
    this.status = status;
  }
}

/** The one place a catalog float becomes money. Only USD is accepted. */
export function priceToCents(value: number, currency: string): number | null {
  if (currency.toUpperCase() !== "USD" || !Number.isFinite(value) || value <= 0) return null;
  return decimalToCents(value.toFixed(2));
}
