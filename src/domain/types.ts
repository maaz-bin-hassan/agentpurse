export const CATEGORIES = ["groceries", "travel", "software", "electronics"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

export type Decision = "allow" | "deny" | "needs_approval" | "needs_clarification";

export type SpendStatus =
  | "denied"
  | "needs_clarification"
  | "pending_approval"
  | "captured"
  | "refunded";

export type AgentStatus = "active" | "paused";

export interface RuleHit {
  code: string;
  sentence: string;
}

export interface Purse {
  id: string;
  name: string;
  ownerName: string;
  currency: string;
  balanceCents: number;
  perTxnCapCents: number;
  dailyCapCents: number;
  approvalThresholdCents: number;
  createdAt: string;
}

export interface Envelope {
  id: string;
  purseId: string;
  name: string;
  category: Category;
  limitCents: number;
  period: Period;
  createdAt: string;
}

export interface Agent {
  id: string;
  purseId: string;
  name: string;
  description: string;
  allowedCategories: Category[];
  status: AgentStatus;
  createdAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  category: Category;
  trusted: boolean;
  blocked: boolean;
}

export interface SpendRequest {
  id: string;
  purseId: string;
  agentId: string;
  envelopeId: string | null;
  rawText: string;
  merchantName: string | null;
  amountCents: number | null;
  currency: string | null;
  category: Category | null;
  purpose: string | null;
  confidence: number | null;
  decision: Decision | null;
  decisionReasons: RuleHit[];
  explanation: string | null;
  status: SpendStatus;
  paypalOrderId: string | null;
  captureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  spendRequestId: string;
  decision: "pending" | "approved" | "denied";
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  purseId: string | null;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface PaypalOrderRecord {
  id: string;
  purseId: string | null;
  spendRequestId: string | null;
  kind: "topup" | "spend";
  status: string;
  currency: string;
  amountCents: number;
  captureId: string | null;
  customId: string | null;
  rawJson: string;
  createdAt: string;
  updatedAt: string;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isPeriod(value: string): value is Period {
  return (PERIODS as readonly string[]).includes(value);
}
