import { createHmac, timingSafeEqual } from "node:crypto";
import { assessIntent } from "@/src/ai/guard";
import { Channel3Error, priceToCents } from "@/src/channel3";
import { attributionId, readOffer } from "@/src/channel3/catalog";
import { setMockPrice } from "@/src/channel3/mock";
import { channel3Mode } from "@/src/config";
import {
  cancelWatchRow,
  claimWatch,
  finishWatch,
  getWatch,
  insertAudit,
  insertWatch,
  listWatches,
  newId,
  recordChannel3Event,
  watchesForSubscription,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import { formatMoney } from "@/src/domain/money";
import type { PriceWatch } from "@/src/domain/types";
import { requestPurchase, type ActionOptions } from "@/src/server/actions";
import { fail, type ActionResult } from "@/src/server/http";
import { agentFor, channel3For, purchaseSentence, verifiedPurchase, withFulfillment } from "@/src/server/shop";

type Failure = { ok: false; error: string };
const TOLERANCE_MS = 5 * 60_000;

async function audit(sql: Sql, watch: PriceWatch, action: string, detail: string, at: string) {
  await insertAudit(sql, { id: newId("audit"), ownerId: watch.ownerId, actor: "price watch", action, detail, createdAt: at });
}

/** Reads the price from Channel3, never from the event. At or under target, it files a normal purchase once. */
export async function checkWatch(sql: Sql, watch: PriceWatch, options?: ActionOptions) {
  const client = channel3For(sql, options);
  const offer = await readOffer(client, { productId: watch.productId, domain: watch.domain });
  if (offer.amountCents > watch.targetCents) return { triggered: false as const, currentCents: offer.amountCents };
  const at = (options?.now ?? new Date()).toISOString();
  if (!(await claimWatch(sql, watch.id, at))) return { triggered: false as const, currentCents: offer.amountCents };
  await audit(sql, watch, "watch_triggered", `${watch.productTitle} reached ${formatMoney(offer.amountCents)} at ${watch.domain}. The clerk decides next.`, at);
  const result = await requestPurchase(sql, watch.agentId, purchaseSentence(offer), {
    ...options,
    originalTask: watch.originalTask,
    verified: verifiedPurchase(offer, offer.amountCents, `Price watch hit ${formatMoney(watch.targetCents)} target.`),
  });
  const intentId = result.body.ok ? result.body.intent.id : null;
  await finishWatch(sql, watch.id, intentId, at);
  if (watch.subscriptionId) await client.cancelSubscription(watch.subscriptionId).catch(() => undefined);
  return { triggered: true as const, currentCents: offer.amountCents, purchase: withFulfillment(result.body) };
}

export async function createWatch(
  sql: Sql,
  input: { ownerId: string; agentId?: string | null; productId: string; domain: string; targetCents: number; originalTask: string },
  options?: ActionOptions,
): Promise<ActionResult<{ ok: true; watch: PriceWatch; currentCents: number; explanation: string; purchase?: unknown } | Failure>> {
  if (!Number.isInteger(input.targetCents) || input.targetCents <= 0) return fail(400, "Set the target price in whole cents.");
  try {
    const client = channel3For(sql, options);
    const offer = await readOffer(client, { productId: input.productId, domain: input.domain, userId: attributionId(input.ownerId) });
    const guard = assessIntent({
      originalTask: input.originalTask,
      merchantName: offer.domain,
      amountCents: offer.amountCents,
      category: offer.category,
      purpose: offer.title,
      listing: { title: offer.title, text: offer.listingText },
    });
    if (guard.decision === "block") return fail(409, guard.reasons.map((reason) => reason.sentence).join(" "));
    const agent = await agentFor(sql, input.ownerId, input.agentId, offer.category);
    if (!agent) return fail(404, "No agent is available.");
    const at = (options?.now ?? new Date()).toISOString();
    const reached = offer.amountCents <= input.targetCents;
    const subscription = reached ? null : await client.createSubscription({ productId: offer.productId, domains: [offer.domain] });
    const watch: PriceWatch = {
      id: newId("watch"),
      ownerId: input.ownerId,
      agentId: agent.id,
      productId: offer.productId,
      productTitle: offer.title,
      domain: offer.domain,
      targetCents: input.targetCents,
      startCents: offer.amountCents,
      originalTask: input.originalTask,
      subscriptionId: subscription?.subscriptionId ?? null,
      status: "watching",
      intentId: null,
      createdAt: at,
      updatedAt: at,
    };
    await insertWatch(sql, watch);
    await audit(sql, watch, "watch_created", `Watching ${offer.title} at ${offer.domain} for ${formatMoney(input.targetCents)} or less.`, at);
    if (reached) {
      const checked = await checkWatch(sql, watch, options);
      return { status: 200, body: { ok: true, watch, currentCents: offer.amountCents, explanation: `Already at ${formatMoney(offer.amountCents)}, so the clerk ruled right away.`, purchase: checked.triggered ? checked.purchase : undefined } };
    }
    return { status: 200, body: { ok: true, watch, currentCents: offer.amountCents, explanation: `Watching. It is ${formatMoney(offer.amountCents)} now, and the clerk rules when it reaches ${formatMoney(input.targetCents)}.` } };
  } catch (error) {
    if (error instanceof Channel3Error) return fail(error.status, error.message);
    throw error;
  }
}

export async function cancelWatch(sql: Sql, ownerId: string, watchId: string, actorAgentId?: string | null, options?: ActionOptions) {
  const watch = await getWatch(sql, watchId);
  if (!watch || watch.ownerId !== ownerId || (actorAgentId && watch.agentId !== actorAgentId)) return fail(404, "Unknown watch.");
  if (watch.status !== "watching") return fail(409, "This watch has already finished.");
  const at = (options?.now ?? new Date()).toISOString();
  await cancelWatchRow(sql, watch.id, at);
  if (watch.subscriptionId) await channel3For(sql, options).cancelSubscription(watch.subscriptionId).catch(() => undefined);
  await audit(sql, watch, "watch_cancelled", `Stopped watching ${watch.productTitle}.`, at);
  return { status: 200, body: { ok: true as const, explanation: "Watch cancelled." } };
}

export async function checkWatchNow(sql: Sql, ownerId: string, watchId: string, options?: ActionOptions) {
  const watch = await getWatch(sql, watchId);
  if (!watch || watch.ownerId !== ownerId) return fail(404, "Unknown watch.");
  if (watch.status !== "watching") return fail(409, "This watch has already finished.");
  try {
    const checked = await checkWatch(sql, watch, options);
    const explanation = checked.triggered ? `It reached ${formatMoney(checked.currentCents)}, so the clerk ruled.` : `Still ${formatMoney(checked.currentCents)}. The target is ${formatMoney(watch.targetCents)}.`;
    return { status: 200, body: { ok: true as const, explanation, ...checked } };
  } catch (error) {
    if (error instanceof Channel3Error) return fail(error.status, error.message);
    throw error;
  }
}

/** Mock only: stands in for a retailer cutting the price, so the demo needs no webhook. */
export async function simulateDrop(sql: Sql, ownerId: string, watchId: string, options?: ActionOptions) {
  if (channel3Mode(options?.env ?? process.env) !== "mock") return fail(403, "Simulated drops only exist with mock Channel3 data.");
  const watch = await getWatch(sql, watchId);
  if (!watch || watch.ownerId !== ownerId) return fail(404, "Unknown watch.");
  await setMockPrice(sql, watch.productId, watch.domain, watch.targetCents);
  return checkWatchNow(sql, ownerId, watchId, options);
}

export async function householdWatches(sql: Sql, ownerId: string, agentId?: string | null) {
  return (await listWatches(sql, ownerId)).filter((watch) => !agentId || watch.agentId === agentId);
}

export function verifyChannel3Signature(input: { id: string; timestamp: string; signature: string; rawBody: string; secret: string; now?: Date }): boolean {
  const seconds = Number(input.timestamp);
  if (!Number.isFinite(seconds) || Math.abs((input.now ?? new Date()).getTime() - seconds * 1000) > TOLERANCE_MS) return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.rawBody}`).digest();
  return input.signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface WebhookEvent {
  id?: string;
  type?: string;
  data?: {
    subscription_id?: string;
    subject?: { domain?: string };
    current?: { price?: number; currency?: string };
  };
}

export async function handleChannel3Webhook(
  sql: Sql,
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  options: ActionOptions & { secret: string },
): Promise<{ status: number; body: { ok: boolean; error?: string; duplicate?: boolean; triggered?: number } }> {
  if (!verifyChannel3Signature({ ...headers, rawBody, secret: options.secret, now: options.now })) {
    return { status: 400, body: { ok: false, error: "Webhook signature was rejected." } };
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return { status: 400, body: { ok: false, error: "Webhook body is not JSON." } };
  }
  const eventId = event.id ?? headers.id;
  if (await sql.get("SELECT id FROM channel3_events WHERE id = ?", [eventId])) return { status: 200, body: { ok: true, duplicate: true } };

  let triggered = 0;
  if (event.type === "offer.price.changed" && event.data?.subscription_id) {
    const claimed = event.data.current?.price == null ? null : priceToCents(event.data.current.price, event.data.current.currency ?? "USD");
    for (const watch of await watchesForSubscription(sql, event.data.subscription_id)) {
      if (event.data.subject?.domain?.toLowerCase() !== watch.domain.toLowerCase()) continue;
      if (claimed == null || claimed > watch.targetCents) continue;
      try {
        if ((await checkWatch(sql, watch, options)).triggered) triggered += 1;
      } catch (error) {
        if (!(error instanceof Channel3Error)) throw error;
        // A failed read is retried by Channel3. Out of stock or gone is final for this event.
        if (error.status !== 404 && error.status !== 409) return { status: 502, body: { ok: false, error: error.message } };
      }
    }
  }
  await recordChannel3Event(sql, eventId, event.type ?? "unknown", (options.now ?? new Date()).toISOString());
  return { status: 200, body: { ok: true, triggered } };
}
