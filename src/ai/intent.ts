import { aiMode, aiProvider, type AppEnv } from "@/src/config";
import { decimalToCents } from "@/src/domain/money";
import { isCategory, type Category, type Merchant } from "@/src/domain/types";

export interface ParsedIntent {
  merchantName: string | null;
  amountCents: number | null;
  currency: "USD" | null;
  category: Category | null;
  purpose: string;
  confidence: number;
  source: "mock" | "groq" | "gemini";
  complete: boolean;
  note?: string;
}

const KEYWORDS: Record<Category, string[]> = {
  groceries: ["oat", "milk", "egg", "bread", "grocery", "grocer", "produce"],
  travel: ["flight", "hotel", "rail", "train", "ticket", "airfare"],
  software: ["software", "subscription", "saas", "storage"],
  electronics: ["charger", "gadget", "cable", "adapter", "laptop"],
};

const MONEY = [
  /\$\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/,
  /\b(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:usd|dollars)\b/i,
  /\bUSD\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/i,
];

export function extractAmountCents(text: string): number | null {
  for (const pattern of MONEY) {
    const match = pattern.exec(text);
    if (!match) continue;
    const cents = decimalToCents(match[1]);
    if (cents != null) return cents;
  }
  return null;
}

function keywordCategory(text: string): Category | null {
  const haystack = text.toLowerCase();
  for (const category of Object.keys(KEYWORDS) as Category[]) {
    if (KEYWORDS[category].some((word) => haystack.includes(word))) return category;
  }
  return null;
}

function knownMerchant(text: string, merchants: Merchant[]): Merchant | undefined {
  return merchants
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
    .find((merchant) => text.toLowerCase().includes(merchant.name.toLowerCase()));
}

function merchantPhrase(text: string): string | null {
  const match = /\b(?:from|at|via|on)\s+([A-Za-z][\w'&-]*(?:\s+[A-Za-z][\w'&-]*){0,3})/i.exec(text);
  if (!match) return null;
  return match[1].replace(/[.,!?;:]+$/g, "").replace(/\s+\b(?:for|to|at|the|a|an)\b.*$/i, "").trim();
}

export function parseLocally(text: string, merchants: Merchant[]): ParsedIntent {
  const amountCents = extractAmountCents(text);
  const known = knownMerchant(text, merchants);
  const merchantName = known?.name ?? merchantPhrase(text);
  const category = known?.category ?? (merchantName ? keywordCategory(text) : null);
  const complete = amountCents != null && amountCents > 0 && Boolean(merchantName) && Boolean(category);
  let confidence = 0.3;
  if (complete && known) confidence = 0.95;
  else if (complete) confidence = 0.7;
  return {
    merchantName: merchantName || null,
    amountCents,
    currency: amountCents != null ? "USD" : null,
    category,
    purpose: text.trim(),
    confidence,
    source: "mock",
    complete,
  };
}

export function interpretModelPayload(
  text: string,
  payload: unknown,
  merchants: Merchant[],
  source: "groq" | "gemini",
): ParsedIntent {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const localAmount = extractAmountCents(text);
  const claimedAmount = typeof record.amountCents === "number" ? record.amountCents : null;
  const amountCents = claimedAmount != null && localAmount != null && claimedAmount === localAmount ? localAmount : null;
  const claimedMerchant = typeof record.merchantName === "string" ? record.merchantName.trim() : "";
  const known = merchants.find((merchant) => merchant.name.toLowerCase() === claimedMerchant.toLowerCase());
  const mentioned =
    claimedMerchant.length > 1 && text.toLowerCase().includes(claimedMerchant.toLowerCase());
  let merchantName: string | null = null;
  let category: Category | null = null;
  if (known && text.toLowerCase().includes(known.name.toLowerCase())) {
    merchantName = known.name;
    category = known.category;
  } else if (mentioned) {
    merchantName = claimedMerchant;
    const modelCategory = typeof record.category === "string" && isCategory(record.category) ? record.category : null;
    category = keywordCategory(text) ?? modelCategory;
  }
  const complete = Boolean(merchantName && category && amountCents != null && amountCents > 0);
  const purpose = typeof record.purpose === "string" && record.purpose.trim() ? record.purpose.trim() : text.trim();
  return {
    merchantName,
    amountCents,
    currency: amountCents != null ? "USD" : null,
    category,
    purpose,
    confidence: complete ? 0.8 : 0.3,
    source,
    complete,
    note: amountCents == null && claimedAmount != null ? "Ignored a model amount that was not written in the sentence." : undefined,
  };
}

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function completeLive(
  text: string,
  merchants: Merchant[],
  env: AppEnv,
  fetchImpl: FetchLike,
): Promise<ParsedIntent> {
  const provider = aiProvider(env);
  const catalog = merchants.map((merchant) => `${merchant.name} (${merchant.category})`).join(", ");
  const prompt = [
    "Extract a payment intent as JSON with keys merchantName, amountCents, category, purpose.",
    "amountCents is an integer number of US cents and must be copied from the sentence.",
    "category must be groceries, travel, software, or electronics.",
    `Known merchants: ${catalog}.`,
    "Return JSON only.",
    `Sentence: ${text}`,
  ].join("\n");

  if (provider === "gemini") {
    const key = env.GEMINI_API_KEY;
    if (!key) return { ...parseLocally(text, merchants), note: "AI_MODE=live but GEMINI_API_KEY is unset. Used the local parser." };
    const model = env.AI_MODEL || "gemini-2.5-flash";
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!response.ok) return { ...parseLocally(text, merchants), note: `Gemini request failed (${response.status}). Used the local parser.` };
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return interpretModelPayload(text, JSON.parse(stripFence(raw)), merchants, "gemini");
  }

  const key = env.GROQ_API_KEY;
  if (!key) return { ...parseLocally(text, merchants), note: "AI_MODE=live but GROQ_API_KEY is unset. Used the local parser." };
  const model = env.AI_MODEL || "llama-3.3-70b-versatile";
  const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return { ...parseLocally(text, merchants), note: `Groq request failed (${response.status}). Used the local parser.` };
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  return interpretModelPayload(text, JSON.parse(stripFence(raw)), merchants, "groq");
}

export async function parseSpendIntent(
  text: string,
  options: {
    merchants: Merchant[];
    env?: AppEnv;
    fetchImpl?: FetchLike;
  },
): Promise<ParsedIntent> {
  const env = options.env ?? process.env;
  if (aiMode(env) !== "live") return parseLocally(text, options.merchants);
  try {
    return await completeLive(text, options.merchants, env, options.fetchImpl ?? fetch);
  } catch {
    return { ...parseLocally(text, options.merchants), note: "The live model response could not be read. Used the local parser." };
  }
}
