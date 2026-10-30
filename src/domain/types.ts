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
export type VaultStatus = "payer_action_required" | "vaulted" | "revoked";
export type IntentStatus =
  | "denied"
  | "blocked"
  | "needs_clarification"
  | "pending_approval"
  | "awaiting_paypal"
  | "captured"
  | "refunded"
  | "failed";

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

export interface Owner {
  id: string;
  name: string;
  email: string;
  panicFrozen: boolean;
  createdAt: string;
}

export interface Vault {
  id: string;
  ownerId: string;
  setupTokenId: string | null;
  paymentTokenId: string | null;
  paypalCustomerId: string | null;
  payerEmail: string | null;
  status: VaultStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  provider: string;
  description: string;
  apiKeyPrefix: string;
  allowanceCents: number;
  status: AgentStatus;
  allowedCategories: Category[];
  perTxnCapCents: number;
  dailyCapCents: number;
  approvalThresholdCents: number;
  trustedMerchantsOnly: boolean;
  policyText: string | null;
  policySource: string | null;
  createdAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  category: Category;
  trusted: boolean;
  blocked: boolean;
  paypalEmail: string;
}

export interface IntentRecord {
  id: string;
  agentId: string;
  ownerId: string;
  originalTask: string;
  rawText: string;
  pageExcerpt: string | null;
  merchantName: string | null;
  merchantEmail: string | null;
  amountCents: number | null;
  currency: string | null;
  category: Category | null;
  purpose: string | null;
  confidence: number | null;
  guardDecision: "pass" | "block" | null;
  guardReasons: RuleHit[];
  decision: Decision | null;
  decisionReasons: RuleHit[];
  explanation: string | null;
  status: IntentStatus;
  paypalOrderId: string | null;
  captureId: string | null;
  approvalMethod: string | null;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  intentId: string;
  agentId: string;
  ownerId: string;
  kind: "capture" | "refund";
  amountCents: number;
  currency: string;
  merchantName: string;
  paypalOrderId: string | null;
  captureId: string | null;
  refundId: string | null;
  customId: string;
  webhookEventId: string | null;
  detail: string;
  createdAt: string;
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
