import { describe, expect, it, vi } from "vitest";
import { interpretModelPayload, parseSpendIntent } from "@/src/ai/intent";
import type { Merchant } from "@/src/domain/types";

const merchants: Merchant[] = [
  { id: "1", name: "Green Grocer", category: "groceries", trusted: true, blocked: false },
  { id: "2", name: "Metro Rail", category: "travel", trusted: true, blocked: false },
  { id: "3", name: "CloudApps", category: "software", trusted: true, blocked: false },
  { id: "4", name: "SkyAir", category: "travel", trusted: true, blocked: false },
  { id: "5", name: "Unknown Gadgets", category: "electronics", trusted: false, blocked: false },
  { id: "6", name: "Lucky Chips", category: "electronics", trusted: false, blocked: true },
];

describe("local intent parser", () => {
  const cases: Array<[string, Partial<{ merchant: string; cents: number; category: string }>]> = [
    ["Buy oat milk and eggs from Green Grocer for $18.40", { merchant: "Green Grocer", cents: 1840, category: "groceries" }],
    ["Book a $900 flight to Lisbon on SkyAir", { merchant: "SkyAir", cents: 90000, category: "travel" }],
    ["Buy Metro Rail tickets for $42", { merchant: "Metro Rail", cents: 4200, category: "travel" }],
    ["Hold a $75 seat from Metro Rail", { merchant: "Metro Rail", cents: 7500, category: "travel" }],
    ["Buy a $30 charger from Unknown Gadgets", { merchant: "Unknown Gadgets", cents: 3000, category: "electronics" }],
    ["Pay CloudApps $12 for the monthly team plan", { merchant: "CloudApps", cents: 1200, category: "software" }],
    ["Buy $10 from Lucky Chips", { merchant: "Lucky Chips", cents: 1000, category: "electronics" }],
  ];

  it.each(cases)("parses %s", async (sentence, expected) => {
    const intent = await parseSpendIntent(sentence, { merchants, env: { AI_MODE: "mock" } });
    expect(intent.complete).toBe(true);
    expect(intent.source).toBe("mock");
    expect(intent.merchantName).toBe(expected.merchant);
    expect(intent.amountCents).toBe(expected.cents);
    expect(intent.category).toBe(expected.category);
  });

  it("does not invent an amount", async () => {
    const intent = await parseSpendIntent("buy some milk from Green Grocer", {
      merchants,
      env: { AI_MODE: "mock" },
    });
    expect(intent.complete).toBe(false);
    expect(intent.amountCents).toBeNull();
  });
});

describe("live model validation", () => {
  it("rejects an amount the model invented", () => {
    const intent = interpretModelPayload(
      "Buy oat milk from Green Grocer for $18.40",
      { merchantName: "Green Grocer", amountCents: 90000, category: "groceries", purpose: "milk" },
      merchants,
      "groq",
    );
    expect(intent.complete).toBe(false);
    expect(intent.amountCents).toBeNull();
    expect(intent.note).toContain("Ignored a model amount");
  });

  it("keeps the catalog category when the model relabels a merchant", () => {
    const intent = interpretModelPayload(
      "Book a $900 flight on SkyAir",
      { merchantName: "SkyAir", amountCents: 90000, category: "groceries", purpose: "flight" },
      merchants,
      "groq",
    );
    expect(intent.complete).toBe(true);
    expect(intent.category).toBe("travel");
  });

  it("sends the sentence to Groq and then validates the JSON", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  merchantName: "Green Grocer",
                  amountCents: 1840,
                  category: "groceries",
                  purpose: "oat milk and eggs",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const intent = await parseSpendIntent("Buy oat milk and eggs from Green Grocer for $18.40", {
      merchants,
      env: { AI_MODE: "live", AI_PROVIDER: "groq", GROQ_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(intent.source).toBe("groq");
    expect(intent.amountCents).toBe(1840);
    expect(intent.merchantName).toBe("Green Grocer");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.groq.com");
    expect(String((init.headers as Record<string, string>).Authorization)).toBe("Bearer test-key");
  });

  it("falls back to the local parser when live mode has no key", async () => {
    const intent = await parseSpendIntent("Pay CloudApps $12 for the monthly team plan", {
      merchants,
      env: { AI_MODE: "live", AI_PROVIDER: "groq" },
    });
    expect(intent.source).toBe("mock");
    expect(intent.merchantName).toBe("CloudApps");
    expect(intent.note).toContain("GROQ_API_KEY");
  });
});
