import { z } from "zod";
import { aiMode, aiProvider, type AppEnv } from "@/src/config";
import { decimalToCents } from "@/src/domain/money";
import { CATEGORIES, isCategory, type Category } from "@/src/domain/types";

export const policySchema = z.object({
  perTxnCapCents: z.number().int().positive(),
  dailyCapCents: z.number().int().positive(),
  approvalThresholdCents: z.number().int().nonnegative(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  trustedMerchantsOnly: z.boolean(),
});

export type StructuredPolicy = z.infer<typeof policySchema>;

const KEYWORDS: Record<Category, string[]> = {
  groceries: ["grocery", "groceries", "food"],
  travel: ["travel", "flight", "hotel", "train"],
  software: ["software", "saas", "subscription"],
  electronics: ["electronics", "charger", "gadget", "household"],
};

export function compileLocally(text: string): StructuredPolicy {
  const amounts = [...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map((match) => decimalToCents(match[1]) ?? 0);
  const perTxn = /up to|per (payment|trip|purchase)/i.test(text) ? amounts[0] : amounts[0];
  const daily = /daily|a day|per day/i.test(text) ? amounts[1] ?? (perTxn ?? 15000) * 2 : (perTxn ?? 15000) * 4;
  const approval = /ask me|approval|approve/i.test(text) ? amounts.find((_, index) => index > 0) ?? 5000 : 5000;
  const categories = (Object.keys(KEYWORDS) as Category[]).filter((category) =>
    KEYWORDS[category].some((word) => text.toLowerCase().includes(word)),
  );
  const parsed = policySchema.safeParse({
    perTxnCapCents: perTxn || 15000,
    dailyCapCents: daily || 30000,
    approvalThresholdCents: approval,
    categories: categories.length ? categories : ["groceries"],
    trustedMerchantsOnly: /trusted/i.test(text),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }
  return parsed.data;
}

export function parsePolicyJson(payload: unknown): StructuredPolicy {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const categories = Array.isArray(record.categories) ? record.categories.filter((item): item is Category => typeof item === "string" && isCategory(item)) : [];
  return policySchema.parse({ ...record, categories });
}

export async function compilePolicy(
  text: string,
  options?: { env?: AppEnv; fetchImpl?: typeof fetch },
): Promise<{ policy: StructuredPolicy; source: "mock" | "groq" | "gemini"; note?: string }> {
  const env = options?.env ?? process.env;
  if (aiMode(env) !== "live") return { policy: compileLocally(text), source: "mock" };
  const provider = aiProvider(env);
  const key = provider === "gemini" ? env.GEMINI_API_KEY : env.GROQ_API_KEY;
  if (!key) return { policy: compileLocally(text), source: "mock", note: "No model key. Used the local compiler." };
  try {
    const fetchImpl = options?.fetchImpl ?? fetch;
    const prompt = `Convert this spending rule into JSON with keys perTxnCapCents, dailyCapCents, approvalThresholdCents, categories (groceries|travel|software|electronics), trustedMerchantsOnly. JSON only.\n${text}`;
    const response =
      provider === "gemini"
        ? await fetchImpl(
            `https://generativelanguage.googleapis.com/v1beta/models/${env.AI_MODEL || "gemini-2.5-flash"}:generateContent?key=${encodeURIComponent(key)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
          )
        : await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ model: env.AI_MODEL || "llama-3.3-70b-versatile", temperature: 0, messages: [{ role: "user", content: prompt }] }),
          });
    if (!response.ok) return { policy: compileLocally(text), source: "mock", note: `Model request failed (${response.status}).` };
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = json.choices?.[0]?.message?.content ?? json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { policy: parsePolicyJson(JSON.parse(raw.replace(/```json|```/g, "").trim())), source: provider };
  } catch {
    return { policy: compileLocally(text), source: "mock", note: "The model JSON did not match the policy schema." };
  }
}
