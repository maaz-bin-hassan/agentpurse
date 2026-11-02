import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLiveChannel3 } from "@/src/channel3/live";
import { mapCategory, readOffer, summarize } from "@/src/channel3/catalog";
import { createMockChannel3, setMockPrice } from "@/src/channel3/mock";
import { Channel3Error, priceToCents, type Channel3Client } from "@/src/channel3/types";
import { openDatabase } from "@/src/db/connection";
import { getIntent, getWatch, listReceipts } from "@/src/db/repository";
import { DEMO_KEYS, seedDemo } from "@/src/db/seed";
import type { Sql } from "@/src/db/sql";
import { actorFromBearer, callTool } from "@/src/mcp/protocol";
import { approveIntent, panicFreeze, pauseAgent, revokeVault } from "@/src/server/actions";
import { buyProduct, createCatalogQuote, payCatalogQuote, searchCatalog } from "@/src/server/shop";
import { cancelWatch, checkWatchNow, createWatch, handleChannel3Webhook, simulateDrop, verifyChannel3Signature } from "@/src/server/watches";

const ENV = { PAYPAL_MODE: "mock", AI_MODE: "mock", CHANNEL3_MODE: "mock" };
const OWNER = "purse_maaz";
const SECRET = `whsec_${Buffer.from("channel3-test-secret").toString("base64")}`;

async function household() {
  const sql = await openDatabase(":memory:");
  await seedDemo(sql);
  return sql;
}

function sign(id: string, timestamp: string, body: string) {
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function priced(cents: number): Channel3Client {
  const base = createMockChannel3(null as unknown as Sql);
  return {
    ...base,
    async getProduct(productId) {
      return {
        id: productId,
        title: "VoltBay 65W USB-C charger",
        description: "",
        offers: [{ url: "https://buy.example/x", domain: "voltbay.example", price: { price: cents / 100, currency: "USD", compareAtPrice: null }, availability: "InStock" }],
      };
    },
    async priceHistory() {
      return { productId: "x", points: [], statistics: null };
    },
  };
}

describe("catalog money", () => {
  it("turns floats into exact cents", () => {
    expect(priceToCents(19.99, "USD")).toBe(1999);
    expect(priceToCents(0.07, "USD")).toBe(7);
    expect(priceToCents(1.1, "USD")).toBe(110);
    expect(priceToCents(129, "USD")).toBe(12900);
  });

  it("refuses other currencies and nonsense", () => {
    expect(priceToCents(10, "EUR")).toBeNull();
    expect(priceToCents(0, "USD")).toBeNull();
    expect(priceToCents(Number.NaN, "USD")).toBeNull();
  });

  it("refuses out-of-stock and foreign offers when reading a price", async () => {
    const offer = { url: "u", domain: "a.example", price: { price: 5, currency: "USD", compareAtPrice: null }, availability: "OutOfStock" };
    const client = { getProduct: async () => ({ id: "p", title: "T", offers: [offer] }) } as unknown as Channel3Client;
    await expect(readOffer(client, { productId: "p", domain: "a.example" })).rejects.toBeInstanceOf(Channel3Error);
    const euros = { ...offer, availability: "InStock", price: { ...offer.price, currency: "EUR" } };
    const foreign = { getProduct: async () => ({ id: "p", title: "T", offers: [euros] }) } as unknown as Channel3Client;
    await expect(readOffer(foreign, { productId: "p", domain: "a.example" })).rejects.toThrow(/USD/);
    await expect(readOffer(foreign, { productId: "p", domain: "b.example" })).rejects.toThrow(/does not sell/);
  });

  it("maps categories and sends everything else to shopping", () => {
    expect(mapCategory({ category: { slug: "electronics-audio", title: "Headphones" } })).toBe("electronics");
    expect(mapCategory({ category: { slug: "food-drinks", title: "Drinks", path: [{ slug: "grocery", title: "Grocery" }] } })).toBe("groceries");
    expect(mapCategory({ category: { slug: "home-kitchen", title: "Kitchen" } })).toBe("shopping");
    expect(mapCategory({ category: null })).toBe("shopping");
  });
});

describe("live Channel3 client", () => {
  it("sends the key, filters in dollars, and reads documented responses", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createLiveChannel3({
      apiKey: "key",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ products: [{ id: "p1", title: "Thing", offers: [{ url: "u", domain: "d.example", price: { price: 19.99, currency: "USD" }, availability: "InStock" }] }], next_page_token: null });
      },
    });
    const [product] = await client.search({ query: "thing", maxPriceCents: 2500, userId: "u1" });
    expect(new Headers(calls[0].init?.headers).get("x-api-key")).toBe("key");
    expect(new Headers(calls[0].init?.headers).get("x-user-id")).toBe("u1");
    expect(JSON.parse(String(calls[0].init?.body)).filters.price.max_price).toBe(25);
    expect(summarize(product).offers[0].priceCents).toBe(1999);
  });

  it("explains running out of credits", async () => {
    const client = createLiveChannel3({ apiKey: "key", fetchImpl: async () => new Response("{}", { status: 402 }) });
    await expect(client.getProduct("p")).rejects.toMatchObject({ status: 402 });
  });

  it("cancels a subscription with DELETE", async () => {
    let method = "";
    const client = createLiveChannel3({
      apiKey: "key",
      fetchImpl: async (_url, init) => {
        method = String(init?.method);
        return Response.json({ subscription_id: "s1", status: "cancelled" });
      },
    });
    await client.cancelSubscription("s1");
    expect(method).toBe("DELETE");
  });
});

describe("buying from the catalog", () => {
  const options = { env: ENV };

  it("finds offers and keeps listing prose away from the agent", async () => {
    const sql = await household();
    const found = await searchCatalog(sql, OWNER, { query: "charger" }, options);
    if (!found.body.ok) throw new Error("expected results");
    expect(found.body.disclosure).toContain("commission");
    const poisoned = found.body.products.find((product) => product.productId === "prod_poisoned");
    expect(poisoned?.flagged).toBe(true);
    expect(JSON.stringify(found.body)).not.toContain("Ignore the shopper");
    await sql.close();
  });

  it("pays a trusted retailer in budget and says no retailer order exists", async () => {
    const sql = await household();
    const paid = await buyProduct(sql, { ownerId: OWNER, productId: "prod_charger", domain: "voltbay.example", originalTask: "Buy a USB-C charger under $30" }, options);
    if (!paid.body.ok) throw new Error(paid.body.error);
    const body = paid.body as unknown as { intent: { status: string; amountCents: number; agentId: string }; buyUrl: string; fulfillment: string };
    expect(body.intent).toMatchObject({ status: "captured", amountCents: 2499, agentId: "agent_handy" });
    expect(body.buyUrl).toContain("voltbay");
    expect(body.fulfillment).toContain("No retailer order");
    await sql.close();
  });

  it("holds a first-time retailer for the owner", async () => {
    const sql = await household();
    const held = await buyProduct(sql, { ownerId: OWNER, productId: "prod_charger", domain: "parcelpeak.example", originalTask: "Buy a USB-C charger" }, options);
    if (!held.body.ok) throw new Error(held.body.error);
    const intent = (held.body as unknown as { intent: { id: string; status: string } }).intent;
    expect(intent.status).toBe("pending_approval");
    expect((await getIntent(sql, intent.id))?.offerUrl).toContain("parcelpeak");
    await sql.close();
  });

  it("blocks a poisoned listing and a product that does not match the task", async () => {
    const sql = await household();
    const poisoned = await buyProduct(sql, { ownerId: OWNER, productId: "prod_poisoned", domain: "bargainbin.example", originalTask: "Buy a charger" }, options);
    expect((poisoned.body as unknown as { intent: { status: string } }).intent.status).toBe("blocked");
    const drift = await buyProduct(sql, { ownerId: OWNER, productId: "prod_kettle", domain: "hearthline.example", originalTask: "Buy a charger" }, options);
    expect((drift.body as unknown as { intent: { status: string } }).intent.status).toBe("blocked");
    expect(await listReceipts(sql, OWNER, "agent_handy")).toEqual([]);
    await sql.close();
  });

  it("stops payment when the price rose after the quote, and never charges", async () => {
    const sql = await household();
    const quoted = await createCatalogQuote(sql, { ownerId: OWNER, productId: "prod_charger", domain: "voltbay.example", originalTask: "Buy a charger" }, { env: ENV, channel3: priced(2499) });
    if (!quoted.body.ok) throw new Error(quoted.body.error);
    const quote = await sql.get("SELECT * FROM quotes WHERE id = ?", [quoted.body.quoteId]);
    const paid = await payCatalogQuote(sql, quote ?? {}, { env: ENV, channel3: priced(2999) });
    const body = paid.body as unknown as { intent: { status: string; decisionReasons: Array<{ code: string }> } };
    expect(body.intent.status).toBe("denied");
    expect(body.intent.decisionReasons[0].code).toBe("price_moved");
    expect(await listReceipts(sql, OWNER, "agent_handy")).toEqual([]);
    await sql.close();
  });

  it("re-checks the price when the owner signs a held cheque", async () => {
    const sql = await household();
    const held = await buyProduct(sql, { ownerId: OWNER, productId: "prod_charger", domain: "parcelpeak.example", originalTask: "Buy a charger" }, options);
    const id = (held.body as unknown as { intent: { id: string } }).intent.id;
    await setMockPrice(sql, "prod_charger", "parcelpeak.example", 4000);
    const signed = await approveIntent(sql, id, undefined, options);
    expect(signed.status).toBe(409);
    expect(signed.body.ok).toBe(false);
    if (!signed.body.ok) expect(signed.body.error).toContain("price rose");
    await sql.close();
  });

  it("obeys pause, panic, and revoke", async () => {
    const sql = await household();
    const buy = () => buyProduct(sql, { ownerId: OWNER, agentId: "agent_handy", productId: "prod_charger", domain: "voltbay.example", originalTask: "Buy a charger" }, options);
    const status = async () => ((await buy()).body as unknown as { intent: { status: string } }).intent.status;
    await pauseAgent(sql, "agent_handy", true);
    expect(await status()).toBe("denied");
    await pauseAgent(sql, "agent_handy", false);
    await panicFreeze(sql, OWNER, true);
    expect(await status()).toBe("denied");
    await panicFreeze(sql, OWNER, false);
    await revokeVault(sql, OWNER, options);
    expect(await status()).toBe("denied");
    expect(await listReceipts(sql, OWNER, "agent_handy")).toEqual([]);
    await sql.close();
  });
});

describe("price watches", () => {
  const options = { env: ENV };
  const watchInput = { ownerId: OWNER, productId: "prod_headphones", domain: "soundhaven.example", targetCents: 4500, originalTask: "Buy noise-cancelling headphones when they drop" };

  it("does nothing above target, then files one purchase for the clerk", async () => {
    const sql = await household();
    const created = await createWatch(sql, watchInput, options);
    if (!created.body.ok) throw new Error(created.body.error);
    const { watch } = created.body;
    expect(watch.agentId).toBe("agent_handy");
    const early = await checkWatchNow(sql, OWNER, watch.id, options);
    expect(early.body).toMatchObject({ ok: true, triggered: false });

    const dropped = await simulateDrop(sql, OWNER, watch.id, options);
    expect(dropped.body).toMatchObject({ ok: true, triggered: true });
    const stored = await getWatch(sql, watch.id);
    expect(stored?.status).toBe("triggered");
    const intent = await getIntent(sql, stored?.intentId ?? "");
    expect(intent).toMatchObject({ status: "pending_approval", amountCents: 4500 });
    const again = await checkWatchNow(sql, OWNER, watch.id, options);
    expect(again.status).toBe(409);
    await sql.close();
  });

  it("gets no special powers: panic still stops it", async () => {
    const sql = await household();
    const created = await createWatch(sql, watchInput, options);
    if (!created.body.ok) throw new Error(created.body.error);
    await panicFreeze(sql, OWNER, true);
    await simulateDrop(sql, OWNER, created.body.watch.id, options);
    const intent = await getIntent(sql, (await getWatch(sql, created.body.watch.id))?.intentId ?? "");
    expect(intent?.status).toBe("denied");
    await sql.close();
  });

  it("refuses a poisoned listing and a target of nothing", async () => {
    const sql = await household();
    const poisoned = await createWatch(sql, { ...watchInput, productId: "prod_poisoned", domain: "bargainbin.example", originalTask: "Buy a charger" }, options);
    expect(poisoned.status).toBe(409);
    expect((await createWatch(sql, { ...watchInput, targetCents: 0 }, options)).status).toBe(400);
    await sql.close();
  });

  it("blocks simulated drops outside mock data, and other households", async () => {
    const sql = await household();
    const created = await createWatch(sql, watchInput, options);
    if (!created.body.ok) throw new Error(created.body.error);
    expect((await simulateDrop(sql, OWNER, created.body.watch.id, { env: { ...ENV, CHANNEL3_MODE: "live" } })).status).toBe(403);
    expect((await cancelWatch(sql, "someone_else", created.body.watch.id, null, options)).status).toBe(404);
    expect((await cancelWatch(sql, OWNER, created.body.watch.id, null, options)).status).toBe(200);
    await sql.close();
  });

  describe("webhooks", () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const timestamp = String(now.getTime() / 1000);

    async function watching(sql: Sql) {
      const created = await createWatch(sql, watchInput, options);
      if (!created.body.ok) throw new Error(created.body.error);
      return created.body.watch;
    }

    function event(subscriptionId: string | null, price: number, id = "evt_1", domain = "soundhaven.example") {
      return JSON.stringify({ id, type: "offer.price.changed", data: { subscription_id: subscriptionId, subject: { product_id: "prod_headphones", domain }, current: { price, currency: "USD" } } });
    }

    const send = (sql: Sql, body: string, id = "msg_1", at = timestamp) =>
      handleChannel3Webhook(sql, body, { id, timestamp: at, signature: sign(id, at, body) }, { env: ENV, now, secret: SECRET });

    it("verifies the signature, the age, and the secret", () => {
      const body = "{}";
      const good = { id: "m", timestamp, signature: sign("m", timestamp, body), rawBody: body, secret: SECRET, now };
      expect(verifyChannel3Signature(good)).toBe(true);
      expect(verifyChannel3Signature({ ...good, signature: `v2,x ${good.signature}` })).toBe(true);
      expect(verifyChannel3Signature({ ...good, rawBody: "{ }" })).toBe(false);
      expect(verifyChannel3Signature({ ...good, signature: "v1,AAAA" })).toBe(false);
      expect(verifyChannel3Signature({ ...good, now: new Date(now.getTime() + 6 * 60_000) })).toBe(false);
    });

    it("rejects a forged event without touching the watch", async () => {
      const sql = await household();
      const watch = await watching(sql);
      await setMockPrice(sql, watch.productId, watch.domain, 4000);
      const body = event(watch.subscriptionId, 40);
      const forged = await handleChannel3Webhook(sql, body, { id: "m", timestamp, signature: "v1,AAAA" }, { env: ENV, now, secret: SECRET });
      expect(forged.status).toBe(400);
      expect((await getWatch(sql, watch.id))?.status).toBe("watching");
      await sql.close();
    });

    it("ignores an event above target and another retailer", async () => {
      const sql = await household();
      const watch = await watching(sql);
      expect((await send(sql, event(watch.subscriptionId, 90))).body.triggered).toBe(0);
      expect((await send(sql, event(watch.subscriptionId, 40, "evt_2", "parcelpeak.example"))).body.triggered).toBe(0);
      expect((await getWatch(sql, watch.id))?.status).toBe("watching");
      await sql.close();
    });

    it("does not trust the price in the event", async () => {
      const sql = await household();
      const watch = await watching(sql);
      const lied = await send(sql, event(watch.subscriptionId, 40));
      expect(lied.body.triggered).toBe(0);
      expect((await getWatch(sql, watch.id))?.status).toBe("watching");
      await sql.close();
    });

    it("files exactly one purchase, even when delivered twice", async () => {
      const sql = await household();
      const watch = await watching(sql);
      await setMockPrice(sql, watch.productId, watch.domain, 4000);
      const body = event(watch.subscriptionId, 40);
      expect((await send(sql, body)).body.triggered).toBe(1);
      expect((await send(sql, body)).body.duplicate).toBe(true);
      expect((await send(sql, event(watch.subscriptionId, 40, "evt_9"), "msg_9")).body.triggered).toBe(0);
      const intents = await sql.all("SELECT id FROM intents WHERE product_id = 'prod_headphones'");
      expect(intents).toHaveLength(1);
      await sql.close();
    });
  });
});

describe("shopping over MCP", () => {
  const text = (result: unknown) => (result as { content: Array<{ text: string }> }).content[0].text;

  it("goes from search to quote to purchase to receipt, ignoring any price the agent sends", async () => {
    const sql = await household();
    const actor = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_handy}`);
    if (!actor) throw new Error("expected Handy");
    const found = JSON.parse(text(await callTool(sql, actor, "search_products", { query: "USB-C charger", maxPriceCents: 3000 }))) as { products: Array<{ productId: string; offers: Array<{ domain: string }> }> };
    const product = found.products[0];
    const quote = JSON.parse(text(await callTool(sql, actor, "get_quote", { productId: product.productId, domain: "voltbay.example", amountCents: 1, originalTask: "Buy a USB-C charger under $30" }))) as { quoteId: string; amountCents: number };
    expect(quote.amountCents).toBe(2499);
    const paid = JSON.parse(text(await callTool(sql, actor, "request_purchase", { quoteId: quote.quoteId }))) as { intent: { status: string }; buyUrl: string; fulfillment: string };
    expect(paid.intent.status).toBe("captured");
    expect(paid.buyUrl).toContain("buy.channel3");
    expect(paid.fulfillment).toContain("No retailer order");
    const receipts = JSON.parse(text(await callTool(sql, actor, "list_receipts", {}))) as Array<{ amountCents: number }>;
    expect(receipts[0].amountCents).toBe(2499);
    expect(((await callTool(sql, actor, "request_purchase", { quoteId: quote.quoteId })) as { isError?: boolean }).isError).toBe(true);
    await sql.close();
  });

  it("points an over-budget agent at alternatives, and finds cheaper ones", async () => {
    const sql = await household();
    const handy = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_handy}`);
    if (!handy) throw new Error("expected Handy");
    await setMockPrice(sql, "prod_headphones", "soundhaven.example", 18000);
    const quote = JSON.parse(text(await callTool(sql, handy, "get_quote", { productId: "prod_headphones", domain: "soundhaven.example", originalTask: "Buy noise-cancelling headphones" }))) as { quoteId: string };
    const refused = JSON.parse(text(await callTool(sql, handy, "request_purchase", { quoteId: quote.quoteId }))) as { intent: { status: string }; next: string };
    expect(refused.intent.status).toBe("denied");
    expect(refused.next).toContain("find_alternatives");
    const cheaper = JSON.parse(text(await callTool(sql, handy, "find_alternatives", { productId: "prod_charger", maxPriceCents: 2000 }))) as { products: Array<{ productId: string }> };
    expect(cheaper.products.map((item) => item.productId)).toContain("prod_charger_lite");
    await sql.close();
  });

  it("keeps an agent to its own watches", async () => {
    const sql = await household();
    const handy = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_handy}`);
    const grocer = await actorFromBearer(sql, `Bearer ${DEMO_KEYS.agent_grocer}`);
    if (!handy || !grocer) throw new Error("expected actors");
    const created = JSON.parse(text(await callTool(sql, handy, "watch_price", { productId: "prod_headphones", domain: "soundhaven.example", targetCents: 9000, originalTask: "Buy headphones" }))) as { watch: { id: string } };
    expect(JSON.parse(text(await callTool(sql, grocer, "list_watches", {})))).toEqual([]);
    expect(((await callTool(sql, grocer, "cancel_watch", { watchId: created.watch.id })) as { isError?: boolean }).isError).toBe(true);
    expect(JSON.parse(text(await callTool(sql, handy, "list_watches", {})))).toHaveLength(1);
    await sql.close();
  });
});
