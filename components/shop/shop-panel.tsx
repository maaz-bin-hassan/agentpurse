"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { postJson } from "@/components/post-json";
import { decimalToCents, formatMoney } from "@/src/domain/money";

type Offer = { domain: string; priceCents: number; compareAtCents: number | null; inStock: boolean; buyUrl: string };
type Product = {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  rating: { value: number; count: number } | null;
  category: string;
  flagged: boolean;
  offers: Offer[];
};
type Check = { status: string; note: string; points: Array<{ day: string; dollars: number }> };
type Outcome = { tone: string; label: string; text: string; buyUrl?: string; fulfillment?: string };

export type WatchRow = {
  id: string;
  productTitle: string;
  domain: string;
  targetCents: number;
  startCents: number;
  status: string;
  intentId: string | null;
};

const DISCLOSURE = "We may earn a commission when you buy through links on this page.";
const STAMPS: Record<string, [string, string]> = {
  captured: ["allow", "Paid"],
  pending_approval: ["hold", "Held"],
  denied: ["deny", "Denied"],
  blocked: ["deny", "Blocked"],
};

export function ShopPanel({ ownerId, watches, mockCatalog, onPaid }: { ownerId: string; watches: WatchRow[]; mockCatalog: boolean; onPaid: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("noise-cancelling headphones");
  const [maxDollars, setMaxDollars] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [task, setTask] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shop = (body: Record<string, unknown>) => postJson(`/api/households/${ownerId}/shop`, body);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const maxPriceCents = maxDollars ? decimalToCents(maxDollars) : null;
    if (maxDollars && !maxPriceCents) {
      setError("Enter a price limit like 100 or 49.50.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const found = await shop({ action: "search", query, maxPriceCents });
      setProducts(found.products as Product[]);
      setTask(`Buy ${query}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Search failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="panel">
        <h2 className="text-xl">Shop</h2>
        <p className="mt-1 text-sm text-muted">Live offers from Channel3. Whatever you pick still goes to the guard and the clerk.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end" onSubmit={search}>
          <div>
            <label htmlFor="shop-query">What to look for</label>
            <input id="shop-query" value={query} onChange={(event) => setQuery(event.target.value)} required />
          </div>
          <div>
            <label htmlFor="shop-max">Under, USD</label>
            <input id="shop-max" inputMode="decimal" placeholder="Any" value={maxDollars} onChange={(event) => setMaxDollars(event.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</button>
        </form>
        {error ? <p className="mt-3 text-sm text-deny" role="alert">{error}</p> : null}
      </section>

      {products?.length === 0 ? <p className="text-sm text-muted">Nothing matched. Try fewer words.</p> : null}
      {products && products.length > 0 ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.productId} product={product} task={task} shop={shop} onDone={(paid) => { if (paid) onPaid(); router.refresh(); }} />
            ))}
          </div>
          <p className="text-xs text-muted">{DISCLOSURE}</p>
        </>
      ) : null}

      <WatchList watches={watches} mockCatalog={mockCatalog} shop={shop} onDone={(paid) => { if (paid) onPaid(); router.refresh(); }} />
    </div>
  );
}

type Shop = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;

function ProductCard({ product, task, shop, onDone }: { product: Product; task: string; shop: Shop; onDone: (paid: boolean) => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const best = product.offers.find((offer) => offer.inStock);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setOutcome(null);
    try {
      await action();
    } catch (failure) {
      setOutcome({ tone: "deny", label: "Stopped", text: failure instanceof Error ? failure.message : "That did not work." });
    } finally {
      setPending(false);
    }
  }

  const buy = (domain: string) =>
    run(async () => {
      const result = await shop({ action: "buy", productId: product.productId, domain, originalTask: task });
      const intent = result.intent as { status: string; explanation: string };
      const [tone, label] = STAMPS[intent.status] ?? ["quiet", "Noted"];
      setOutcome({ tone, label, text: intent.explanation, buyUrl: result.buyUrl as string | undefined, fulfillment: result.fulfillment as string | undefined });
      onDone(intent.status === "captured");
    });

  const watch = (domain: string) =>
    run(async () => {
      const targetCents = decimalToCents(target);
      if (!targetCents) throw new Error("Enter a target price like 89 or 49.50.");
      const result = await shop({ action: "watch", productId: product.productId, domain, targetCents, originalTask: task });
      setOutcome({ tone: "quiet", label: "Watching", text: String(result.explanation) });
      setWatching(null);
      onDone(false);
    });

  return (
    <article className="panel flex flex-col gap-3">
      <div className="flex gap-3">
        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-20 w-24 shrink-0 rounded-lg border border-line object-cover" /> : null}
        <div className="min-w-0">
          <h3 className="text-lg leading-tight">{product.title}</h3>
          <p className="mt-1 text-xs text-muted">
            {product.brand ?? "Unbranded"}{product.rating ? ` · ${product.rating.value.toFixed(1)} from ${product.rating.count.toLocaleString("en-US")} ratings` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="chip">{product.category}</span>
            {product.flagged ? <span className="stamp deny">Suspicious listing</span> : null}
          </div>
        </div>
      </div>

      <ul className="ledger">
        {product.offers.map((offer) => (
          <li key={offer.domain} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{offer.domain}</p>
                <p className="money text-sm">
                  {formatMoney(offer.priceCents)}
                  {offer.compareAtCents ? <s className="ml-2 text-xs text-muted">{formatMoney(offer.compareAtCents)}</s> : null}
                  {offer === best ? <span className="ml-2 text-xs text-muted">Lowest</span> : null}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button className="btn !min-h-9 !px-3" type="button" disabled={pending || !offer.inStock} onClick={() => void buy(offer.domain)}>Ask the clerk</button>
                <button className="btn secondary !min-h-9 !px-3" type="button" aria-expanded={watching === offer.domain} disabled={pending || !offer.inStock} onClick={() => { setWatching(watching === offer.domain ? null : offer.domain); setTarget((Math.floor(offer.priceCents * 0.85) / 100).toFixed(2)); }}>Watch</button>
              </div>
            </div>
            {watching === offer.domain ? (
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor={`target-${product.productId}-${offer.domain}`}>Buy at or under, USD</label>
                  <input id={`target-${product.productId}-${offer.domain}`} inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
                </div>
                <button className="btn secondary" type="button" disabled={pending} onClick={() => void watch(offer.domain)}>Start watching</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {check ? <PriceHistory check={check} /> : (
        <button className="self-start text-sm underline" type="button" disabled={pending} onClick={() => void run(async () => setCheck((await shop({ action: "price", productId: product.productId })) as unknown as Check))}>
          Is this a good price?
        </button>
      )}

      {outcome ? (
        <div className="text-sm" role="status" data-tone={outcome.tone}>
          <p className="flex items-start gap-2"><span className={`stamp slam ${outcome.tone}`}>{outcome.label}</span><span>{outcome.text}</span></p>
          {outcome.fulfillment ? <p className="mt-1.5 text-xs text-muted">{outcome.fulfillment}</p> : null}
          {outcome.buyUrl ? <a className="mt-1 inline-block text-xs underline" href={outcome.buyUrl} target="_blank" rel="noreferrer">Open the buy link</a> : null}
        </div>
      ) : null}
    </article>
  );
}

function PriceHistory({ check }: { check: Check }) {
  const tone = check.status === "low" ? "allow" : check.status === "high" ? "deny" : "quiet";
  return (
    <div>
      <p className="flex items-center gap-2 text-sm"><span className={`stamp ${tone}`}>{check.status}</span><span className="text-muted">{check.note}</span></p>
      {check.points.length > 1 ? (
        <div className="mt-2 h-20" role="img" aria-label={check.note}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={check.points} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", fontSize: 12 }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
              />
              <Line type="monotone" dataKey="dollars" stroke="var(--ink)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function WatchList({ watches, mockCatalog, shop, onDone }: { watches: WatchRow[]; mockCatalog: boolean; shop: Shop; onDone: (paid: boolean) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function act(action: string, watchId: string) {
    setPending(true);
    setMessage(null);
    try {
      const result = await shop({ action, watchId });
      const purchase = result.purchase as { intent?: { status: string; explanation: string } } | undefined;
      setMessage(purchase?.intent?.explanation ?? String(result.explanation ?? "Done."));
      onDone(purchase?.intent?.status === "captured");
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : "That did not work.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="text-xl">Price watches</h2>
      <p className="mt-1 text-sm text-muted">When a price reaches its target, the agent files a normal purchase. The clerk still decides.</p>
      {watches.length === 0 ? <p className="mt-3 text-sm text-muted">No watches yet. Pick a product and click Watch.</p> : (
        <ul className="ledger mt-3">
          {watches.map((watch) => (
            <li key={watch.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{watch.productTitle}</p>
                <p className="text-xs text-muted">{watch.domain} · was {formatMoney(watch.startCents)} · target <span className="money">{formatMoney(watch.targetCents)}</span></p>
              </div>
              {watch.status === "watching" ? (
                <div className="flex flex-wrap gap-1.5">
                  {mockCatalog ? <button className="btn !min-h-9 !px-3" type="button" disabled={pending} onClick={() => void act("simulate_drop", watch.id)}>Simulate price drop</button> : null}
                  <button className="btn secondary !min-h-9 !px-3" type="button" disabled={pending} onClick={() => void act("check_watch", watch.id)}>Check now</button>
                  <button className="btn secondary !min-h-9 !px-3" type="button" disabled={pending} onClick={() => void act("cancel_watch", watch.id)}>Cancel</button>
                </div>
              ) : <span className={`stamp ${watch.status === "triggered" ? "allow" : "quiet"}`}>{watch.status === "triggered" ? "Reached" : "Cancelled"}</span>}
            </li>
          ))}
        </ul>
      )}
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </section>
  );
}
