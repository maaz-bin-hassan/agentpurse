import { createHash } from "node:crypto";
import { hiddenInstructions } from "@/src/ai/guard";
import { formatMoney } from "@/src/domain/money";
import type { Category } from "@/src/domain/types";
import { Channel3Error, priceToCents, type Channel3Client, type Channel3Product, type PriceHistory } from "@/src/channel3";

export const FULFILLMENT_NOTE = "Sandbox settlement. No retailer order was placed. Finish at the buy link.";
export const COMMISSION_DISCLOSURE = "We may earn a commission when you buy through links on this page.";

const CATEGORY_WORDS: Array<[Category, RegExp]> = [
  ["groceries", /grocer|food|drink|beverage|pantry/],
  ["electronics", /electronic|computer|phone|audio|headphone|charger|camera|tablet/],
  ["software", /software/],
  ["travel", /travel|luggage/],
];

export function mapCategory(product: Pick<Channel3Product, "category">): Category {
  const label = [product.category?.slug, product.category?.title, ...(product.category?.path ?? []).flatMap((item) => [item.slug, item.title])].join(" ").toLowerCase();
  return CATEGORY_WORDS.find(([, pattern]) => pattern.test(label))?.[0] ?? "shopping";
}

export function attributionId(ownerId: string): string {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 24);
}

export interface VerifiedOffer {
  productId: string;
  title: string;
  listingText: string;
  domain: string;
  buyUrl: string;
  imageUrl: string | null;
  amountCents: number;
  category: Category;
}

function mainImage(product: Channel3Product): string | null {
  return product.images?.find((item) => item.is_main_image)?.url ?? product.images?.[0]?.url ?? null;
}

/** Reads the price from Channel3 on the server. An agent never supplies it. */
export async function readOffer(client: Channel3Client, input: { productId: string; domain: string; userId?: string }): Promise<VerifiedOffer> {
  const product = await client.getProduct(input.productId, input.userId);
  const offer = product.offers.find((item) => item.domain.toLowerCase() === input.domain.toLowerCase());
  if (!offer) throw new Channel3Error(`${input.domain} does not sell this product.`, 404);
  if (offer.availability !== "InStock") throw new Channel3Error(`${input.domain} has this product out of stock.`, 409);
  const amountCents = priceToCents(offer.price.price, offer.price.currency);
  if (amountCents == null) throw new Channel3Error("This offer is not priced in USD.", 422);
  return {
    productId: product.id,
    title: product.title,
    listingText: product.description ?? "",
    domain: offer.domain,
    buyUrl: offer.url,
    imageUrl: mainImage(product),
    amountCents,
    category: mapCategory(product),
  };
}

export interface ProductSummary {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  rating: { value: number; count: number } | null;
  category: Category;
  flagged: boolean;
  offers: Array<{ domain: string; priceCents: number; compareAtCents: number | null; inStock: boolean; buyUrl: string }>;
}

/* Listing text stays out of the summary, so a poisoned description never reaches the agent as prose. */
export function summarize(product: Channel3Product): ProductSummary {
  const offers = product.offers.flatMap((item) => {
    const priceCents = priceToCents(item.price.price, item.price.currency);
    if (priceCents == null) return [];
    return [{
      domain: item.domain,
      priceCents,
      compareAtCents: item.price.compareAtPrice == null ? null : priceToCents(item.price.compareAtPrice, item.price.currency),
      inStock: item.availability === "InStock",
      buyUrl: item.url,
    }];
  });
  return {
    productId: product.id,
    title: product.title,
    brand: product.brands?.[0]?.name ?? null,
    imageUrl: mainImage(product),
    rating: product.ratings ? { value: product.ratings.value, count: product.ratings.count } : null,
    category: mapCategory(product),
    flagged: hiddenInstructions(`${product.title}\n${(product.description ?? "").replace(/([.!?])\s+/g, "$1\n")}`).length > 0,
    offers: offers.sort((a, b) => a.priceCents - b.priceCents),
  };
}

export interface PriceCheck {
  status: "low" | "typical" | "high" | "unknown";
  lowCents: number | null;
  highCents: number | null;
  meanCents: number | null;
  note: string;
  points: Array<{ day: string; dollars: number }>;
}

export function priceCheck(history: PriceHistory): PriceCheck {
  const points = history.points.map((point) => ({ day: point.timestamp.slice(5, 10), dollars: point.price }));
  const stats = history.statistics;
  if (!stats) return { status: "unknown", lowCents: null, highCents: null, meanCents: null, note: "No price history yet.", points };
  const lowCents = priceToCents(stats.min_price, stats.currency);
  const highCents = priceToCents(stats.max_price, stats.currency);
  const meanCents = priceToCents(stats.mean, stats.currency);
  const range = lowCents != null && highCents != null ? `, 90-day range ${formatMoney(lowCents)} to ${formatMoney(highCents)}` : "";
  return { status: stats.current_status, lowCents, highCents, meanCents, note: `Price is ${stats.current_status}${range}.`, points };
}
