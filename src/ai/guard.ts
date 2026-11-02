import type { Category, RuleHit } from "@/src/domain/types";

export interface GuardInput {
  originalTask: string;
  merchantName: string | null;
  amountCents: number | null;
  category: Category | null;
  purpose: string;
  pageExcerpt?: string | null;
  /** Catalog text. It is untrusted, like a page. */
  listing?: { title: string; text: string } | null;
}

export interface GuardResult {
  decision: "pass" | "block";
  reasons: RuleHit[];
  hiddenInstructions: string[];
}

const INJECTION = [
  /ignore (all|any|previous|the shopper|the user|prior|your task)/i,
  /\bsystem\s*:/i,
  /disregard (the|your) (task|instructions)/i,
  /you must (now )?(buy|purchase)/i,
  /buy\s+\d+\s+gift cards?/i,
];

const FILLER = new Set(["and", "any", "best", "book", "buy", "cheap", "find", "for", "from", "get", "good", "new", "order", "pack", "please", "the", "under", "with", "wait", "until", "when", "drop", "drops", "dollars", "usd", "that", "this", "some", "one", "two", "pay", "purchase", "me", "my"]);

export function hiddenInstructions(page: string): string[] {
  return page
    .split(/\n|<br\s*\/?>/i)
    .map((line) => line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && INJECTION.some((pattern) => pattern.test(line)));
}

function mentions(haystack: string, needle: string | null): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !FILLER.has(word) && !/^\d+$/.test(word))
      .map((word) => word.replace(/s$/, "")),
  );
}

function sharesWord(task: string, title: string): boolean {
  const wanted = words(task);
  return [...words(title)].some((word) => wanted.has(word));
}

export function assessIntent(input: GuardInput): GuardResult {
  const task = input.originalTask.trim();
  const hidden = input.pageExcerpt ? hiddenInstructions(input.pageExcerpt) : [];
  const reasons: RuleHit[] = [];
  const taskNamesMerchant = mentions(task, input.merchantName);
  const hiddenText = hidden.join(" ");
  const proposalFollowsHidden =
    hidden.length > 0 &&
    !taskNamesMerchant &&
    (mentions(hiddenText, input.merchantName) || (/gift card/i.test(hiddenText) && /gift|lucky chips/i.test(`${input.merchantName ?? ""} ${input.purpose}`)));

  if (proposalFollowsHidden) {
    reasons.push({
      code: "prompt_injection",
      sentence: `Blocked a hidden instruction (“${hidden[0]}”). It is not the task “${task}”.`,
    });
  } else if (input.merchantName && !taskNamesMerchant && hidden.length > 0) {
    reasons.push({
      code: "goal_drift",
      sentence: `${input.merchantName} is not part of “${task}”, and the page is trying to change the purchase.`,
    });
  }

  if (input.listing) {
    const planted = hiddenInstructions(`${input.listing.title}\n${input.listing.text.replace(/([.!?])\s+/g, "$1\n")}`);
    if (planted.length > 0) {
      hidden.push(...planted);
      reasons.push({ code: "prompt_injection", sentence: `This listing hides an instruction (“${planted[0]}”). It is not the task “${task}”.` });
    } else if (!sharesWord(task, input.listing.title)) {
      reasons.push({ code: "goal_drift", sentence: `“${input.listing.title}” has nothing to do with the task “${task}”.` });
    }
  }

  return {
    decision: reasons.length > 0 ? "block" : "pass",
    reasons,
    hiddenInstructions: hidden,
  };
}
