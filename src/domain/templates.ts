import { randomBytes } from "node:crypto";
import { z } from "zod";
import { formatMoney } from "@/src/domain/money";
import { CATEGORIES, type Agent, type Category } from "@/src/domain/types";

/** Templates are starting numbers, not policy. The clerk reads the agent row they produce. */
export type AgentTemplate = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  allowedCategories: Category[];
  allowanceCents: number;
  perTxnCapCents: number;
  dailyCapCents: number;
  approvalThresholdCents: number;
  trustedMerchantsOnly: boolean;
  samples: string[];
};

export const MAX_AGENTS_PER_OWNER = 20;
export const PROVIDERS = ["claude", "chatgpt", "cursor", "grok", "other"] as const;

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  {
    id: "grocery-runner",
    name: "Grocery runner",
    tagline: "Weekly food shop",
    description: "Buys groceries and household food.",
    allowedCategories: ["groceries"],
    allowanceCents: 8_000,
    perTxnCapCents: 6_000,
    dailyCapCents: 8_000,
    approvalThresholdCents: 4_000,
    trustedMerchantsOnly: false,
    samples: ["Buy oat milk and eggs from Green Grocer for $18.40"],
  },
  {
    id: "travel-booker",
    name: "Travel booker",
    tagline: "Trains, flights, hotels",
    description: "Books trips at stores you trust. Asks you before anything big.",
    allowedCategories: ["travel"],
    allowanceCents: 40_000,
    perTxnCapCents: 25_000,
    dailyCapCents: 30_000,
    approvalThresholdCents: 5_000,
    trustedMerchantsOnly: true,
    samples: ["Buy Metro Rail tickets for $42"],
  },
  {
    id: "saas-manager",
    name: "SaaS manager",
    tagline: "Subscriptions and seats",
    description: "Pays for software and add-ons.",
    allowedCategories: ["software"],
    allowanceCents: 5_000,
    perTxnCapCents: 2_500,
    dailyCapCents: 5_000,
    approvalThresholdCents: 1_500,
    trustedMerchantsOnly: true,
    samples: ["Pay CloudApps $9 for extra storage"],
  },
  {
    id: "household-restock",
    name: "Household restock",
    tagline: "Soap, paper, the boring stuff",
    description: "Reorders household supplies before they run out.",
    allowedCategories: ["shopping"],
    allowanceCents: 10_000,
    perTxnCapCents: 4_000,
    dailyCapCents: 6_000,
    approvalThresholdCents: 3_000,
    trustedMerchantsOnly: false,
    samples: ["Buy $25 of paper towels and dish soap"],
  },
  {
    id: "gadget-scout",
    name: "Gadget scout",
    tagline: "Chargers, cables, small tech",
    description: "Finds and buys small electronics at fair prices.",
    allowedCategories: ["electronics"],
    allowanceCents: 15_000,
    perTxnCapCents: 10_000,
    dailyCapCents: 15_000,
    approvalThresholdCents: 4_000,
    trustedMerchantsOnly: true,
    samples: ["Buy a $30 USB-C charger from voltbay.example"],
  },
  {
    id: "gift-buyer",
    name: "Gift buyer",
    tagline: "Birthdays and thank-yous",
    description: "Picks and pays for gifts. You see every one before it is paid.",
    allowedCategories: ["shopping"],
    allowanceCents: 15_000,
    perTxnCapCents: 7_500,
    dailyCapCents: 10_000,
    approvalThresholdCents: 2_500,
    trustedMerchantsOnly: false,
    samples: ["Buy a $35 birthday gift for my sister"],
  },
  {
    id: "deal-hunter",
    name: "Deal hunter",
    tagline: "Waits for the price to drop",
    description: "Sets price watches and buys when the price hits your number.",
    allowedCategories: ["electronics", "shopping"],
    allowanceCents: 20_000,
    perTxnCapCents: 15_000,
    dailyCapCents: 20_000,
    approvalThresholdCents: 5_000,
    trustedMerchantsOnly: true,
    samples: ["Watch noise-cancelling headphones and buy under $100"],
  },
  {
    id: "dev-credits",
    name: "Dev and cloud credits",
    tagline: "API credits, domains, hosting",
    description: "Tops up developer tools and cloud credits.",
    allowedCategories: ["software"],
    allowanceCents: 10_000,
    perTxnCapCents: 5_000,
    dailyCapCents: 7_500,
    approvalThresholdCents: 2_000,
    trustedMerchantsOnly: true,
    samples: ["Pay CloudApps $20 for API credits"],
  },
];

const MAX_CENTS = 1_000_000; // $10,000 per agent while live PayPal is sandbox-only.
const cents = z.number().int().positive().max(MAX_CENTS);

export const AgentEditsSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    provider: z.enum(PROVIDERS),
    description: z.string().trim().max(200),
    allowedCategories: z.array(z.enum(CATEGORIES)).min(1).max(CATEGORIES.length),
    allowanceCents: cents,
    perTxnCapCents: cents,
    dailyCapCents: cents,
    approvalThresholdCents: cents,
    trustedMerchantsOnly: z.boolean(),
  })
  .partial()
  .strict();

export type AgentEdits = z.infer<typeof AgentEditsSchema>;

export function templateById(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((template) => template.id === id);
}

export function newAgentKey(): string {
  return `agpk_${randomBytes(24).toString("base64url")}`;
}

export function buildAgentFromTemplate(
  ownerId: string,
  templateId: string,
  edits: unknown,
  now = new Date(),
): { ok: true; agent: Agent; apiKey: string } | { ok: false; error: string } {
  const template = templateById(templateId);
  if (!template) return { ok: false, error: "Unknown template." };
  const parsed = AgentEditsSchema.safeParse(edits ?? {});
  if (!parsed.success) return { ok: false, error: "Check the agent settings. Amounts are whole cents and every field has a limit." };
  const merged = { ...template, provider: "other" as string, ...parsed.data };
  if (merged.approvalThresholdCents > merged.perTxnCapCents) return { ok: false, error: "The hold-for-me amount must not be above the per-payment cap." };
  if (merged.perTxnCapCents > merged.dailyCapCents) return { ok: false, error: "The per-payment cap must not be above the daily cap." };
  const categories = [...new Set(merged.allowedCategories)];
  const apiKey = newAgentKey();
  const agent: Agent = {
    id: `agent_${randomBytes(6).toString("hex")}`,
    ownerId,
    name: merged.name,
    provider: merged.provider,
    description: merged.description || template.description,
    apiKeyPrefix: apiKey.slice(0, 12),
    allowanceCents: merged.allowanceCents,
    status: "active",
    allowedCategories: categories,
    perTxnCapCents: merged.perTxnCapCents,
    dailyCapCents: merged.dailyCapCents,
    approvalThresholdCents: merged.approvalThresholdCents,
    trustedMerchantsOnly: merged.trustedMerchantsOnly,
    policyText: `${merged.name} may spend ${formatMoney(merged.allowanceCents)} on ${categories.join(" and ")}, up to ${formatMoney(merged.perTxnCapCents)} a payment and ${formatMoney(merged.dailyCapCents)} a day. Anything over ${formatMoney(merged.approvalThresholdCents)}${merged.trustedMerchantsOnly ? " or at an untrusted store" : ""} waits for your signature.`,
    policySource: `template:${template.id}`,
    createdAt: now.toISOString(),
  };
  return { ok: true, agent, apiKey };
}
