import { assessIntent } from "@/src/ai/guard";
import { createChannel3Client, Channel3Error, type Channel3Client } from "@/src/channel3";
import {
  attributionId,
  COMMISSION_DISCLOSURE,
  FULFILLMENT_NOTE,
  priceCheck,
  readOffer,
  summarize,
  type VerifiedOffer,
} from "@/src/channel3/catalog";
import { claimQuote, getAgent, insertQuote, listAgents, newId } from "@/src/db/repository";
import type { Sql, SqlRow } from "@/src/db/sql";
import { merchantPayee } from "@/src/domain/payee";
import { centsToDecimal, formatMoney } from "@/src/domain/money";
import type { Agent, Category, IntentRecord } from "@/src/domain/types";
import { requestPurchase, type ActionOptions, type VerifiedPurchase } from "@/src/server/actions";
import { fail, type ActionResult } from "@/src/server/http";

const QUOTE_MINUTES = 15;
const BUDGET_RULES = new Set(["allowance", "per_txn_cap", "daily_cap"]);

type Failure = { ok: false; error: string };

export function channel3For(sql: Sql, options?: ActionOptions): Channel3Client {
  return options?.channel3 ?? createChannel3Client(sql, options?.env ?? process.env);
}

async function caught<R>(run: () => Promise<R>): Promise<R | ActionResult<Failure>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Channel3Error) return fail(error.status, error.message);
    throw error;
  }
}

async function priceNote(client: Channel3Client, productId: string): Promise<string | null> {
  try {
    return priceCheck(await client.priceHistory(productId)).note;
  } catch {
    return null;
  }
}

/** An agent key keeps its own agent. A household picks the first agent allowed the category. */
export async function agentFor(sql: Sql, ownerId: string, agentId: string | null | undefined, category: Category): Promise<Agent | undefined> {
  if (agentId) {
    const agent = await getAgent(sql, agentId);
    return agent?.ownerId === ownerId ? agent : undefined;
  }
  const agents = await listAgents(sql, ownerId);
  return agents.find((agent) => agent.status === "active" && agent.allowedCategories.includes(category)) ?? agents[0];
}

export function verifiedPurchase(offer: VerifiedOffer, quotedCents: number, note: string | null, quoteId?: string): VerifiedPurchase {
  return {
    merchantName: offer.domain,
    amountCents: offer.amountCents,
    quotedCents,
    category: offer.category,
    purpose: offer.title,
    productId: offer.productId,
    productTitle: offer.title,
    listingText: offer.listingText,
    offerUrl: offer.buyUrl,
    imageUrl: offer.imageUrl,
    priceNote: note,
    quoteId,
  };
}

export function purchaseSentence(offer: VerifiedOffer): string {
  return `Buy ${offer.title} from ${offer.domain} for $${centsToDecimal(offer.amountCents)}`;
}

/** Adds what an agent must relay: where to finish, and that no retailer order exists. */
export function withFulfillment<T extends { ok: boolean }>(body: T): T & { buyUrl?: string; fulfillment?: string; disclosure?: string; next?: string } {
  const record = body as T & { intent?: IntentRecord };
  const intent = record.intent;
  if (!intent?.offerUrl) return body;
  const overBudget = intent.decisionReasons.some((reason) => BUDGET_RULES.has(reason.code));
  return {
    ...body,
    buyUrl: intent.offerUrl,
    disclosure: COMMISSION_DISCLOSURE,
    ...(intent.status === "captured" ? { fulfillment: FULFILLMENT_NOTE } : {}),
    ...(overBudget ? { next: "Over budget. Call find_alternatives for something cheaper, or watch_price to wait for a drop." } : {}),
  };
}

export async function searchCatalog(sql: Sql, ownerId: string, input: { query: string; maxPriceCents?: number }, options?: ActionOptions) {
  return caught(async () => {
    const products = await channel3For(sql, options).search({ ...input, userId: attributionId(ownerId) });
    return { status: 200, body: { ok: true as const, products: products.map(summarize), disclosure: COMMISSION_DISCLOSURE } };
  });
}

export async function productDetail(sql: Sql, ownerId: string, input: { productId?: string; url?: string }, options?: ActionOptions) {
  return caught(async () => {
    const client = channel3For(sql, options);
    const userId = attributionId(ownerId);
    if (!input.productId && !input.url) return fail(400, "Send a product id or a product URL.");
    const product = input.productId ? await client.getProduct(input.productId, userId) : await client.lookupUrl(input.url ?? "", userId);
    return { status: 200, body: { ok: true as const, product: summarize(product), disclosure: COMMISSION_DISCLOSURE } };
  });
}

export async function checkPrice(sql: Sql, productId: string, options?: ActionOptions) {
  return caught(async () => ({ status: 200, body: { ok: true as const, ...priceCheck(await channel3For(sql, options).priceHistory(productId)) } }));
}

export async function findAlternatives(sql: Sql, ownerId: string, input: { productId: string; maxPriceCents?: number }, options?: ActionOptions) {
  return caught(async () => {
    const products = await channel3For(sql, options).similar({ ...input, userId: attributionId(ownerId) });
    return { status: 200, body: { ok: true as const, products: products.map(summarize), disclosure: COMMISSION_DISCLOSURE } };
  });
}

export async function createCatalogQuote(
  sql: Sql,
  input: { ownerId: string; agentId?: string | null; productId: string; domain: string; originalTask: string },
  options?: ActionOptions,
) {
  return caught(async () => {
    const client = channel3For(sql, options);
    const offer = await readOffer(client, { productId: input.productId, domain: input.domain, userId: attributionId(input.ownerId) });
    const agent = await agentFor(sql, input.ownerId, input.agentId, offer.category);
    if (!agent) return fail(404, "No agent is available.");
    const now = options?.now ?? new Date();
    const quoteId = newId("quote");
    await insertQuote(sql, {
      id: quoteId,
      agentId: agent.id,
      merchantName: offer.domain,
      merchantEmail: merchantPayee(options?.env),
      category: offer.category,
      amountCents: offer.amountCents,
      currency: "USD",
      description: offer.title,
      originalTask: input.originalTask,
      pageExcerpt: null,
      expiresAt: new Date(now.getTime() + QUOTE_MINUTES * 60_000).toISOString(),
      createdAt: now.toISOString(),
      productId: offer.productId,
      offerUrl: offer.buyUrl,
    });
    const guard = assessIntent({
      originalTask: input.originalTask,
      merchantName: offer.domain,
      amountCents: offer.amountCents,
      category: offer.category,
      purpose: offer.title,
      listing: { title: offer.title, text: offer.listingText },
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        quoteId,
        agentId: agent.id,
        product: offer.title,
        merchant: offer.domain,
        amountCents: offer.amountCents,
        amount: formatMoney(offer.amountCents),
        buyUrl: offer.buyUrl,
        priceNote: await priceNote(client, offer.productId),
        guard: { decision: guard.decision, reasons: guard.reasons },
        disclosure: COMMISSION_DISCLOSURE,
      },
    };
  });
}

/** Reads the price again before the quote is spent, so a failed read leaves the quote usable. */
export async function payCatalogQuote(sql: Sql, quote: SqlRow, options?: ActionOptions) {
  return caught(async () => {
    const client = channel3For(sql, options);
    const productId = String(quote.product_id);
    const offer = await readOffer(client, { productId, domain: String(quote.merchant_name) });
    const now = options?.now ?? new Date();
    if (!(await claimQuote(sql, String(quote.id), now.toISOString()))) return fail(409, "This quote was already used. Ask for a new quote.");
    const verified = verifiedPurchase(offer, Number(quote.amount_cents), await priceNote(client, productId), String(quote.id));
    const result = await requestPurchase(sql, String(quote.agent_id), purchaseSentence(offer), { ...options, now, originalTask: String(quote.original_task), verified });
    return { status: result.status, body: withFulfillment(result.body) };
  });
}

export async function buyProduct(
  sql: Sql,
  input: { ownerId: string; agentId?: string | null; productId: string; domain: string; originalTask: string },
  options?: ActionOptions,
) {
  const quoted = await createCatalogQuote(sql, input, options);
  if (!quoted.body.ok) return quoted;
  const quote = await sql.get("SELECT * FROM quotes WHERE id = ?", [quoted.body.quoteId]);
  if (!quote) return fail(500, "The quote was not recorded.");
  return payCatalogQuote(sql, quote, options);
}
