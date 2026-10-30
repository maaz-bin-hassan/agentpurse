export type PaypalOrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED";

export interface PaypalAmount {
  currency_code: string;
  value: string;
}

export interface PaypalLink {
  href: string;
  rel: string;
  method: string;
}

export interface PaypalCapture {
  id: string;
  status: "COMPLETED" | "REFUNDED";
  amount: PaypalAmount;
  custom_id?: string;
}

export interface PaypalRefund {
  id: string;
  status: "COMPLETED";
  capture_id: string;
  amount: PaypalAmount;
  create_time: string;
}

export interface PaypalOrder {
  id: string;
  status: PaypalOrderStatus;
  intent: "CAPTURE";
  purchase_units: Array<{
    custom_id?: string;
    description?: string;
    payee?: { email_address: string };
    amount: PaypalAmount;
    payments?: {
      captures?: PaypalCapture[];
      refunds?: PaypalRefund[];
    };
  }>;
  payment_source?: {
    paypal?: {
      vault_id?: string;
      stored_credential?: StoredCredential;
    };
  };
  links: PaypalLink[];
  create_time: string;
  update_time: string;
}

export interface StoredCredential {
  payment_initiator: "MERCHANT" | "CUSTOMER";
  usage: "FIRST" | "SUBSEQUENT" | "DERIVED";
  usage_pattern:
    | "UNSCHEDULED_POSTPAID"
    | "UNSCHEDULED_PREPAID"
    | "RECURRING_PREPAID"
    | "RECURRING_POSTPAID"
    | "SUBSCRIPTION_PREPAID"
    | "SUBSCRIPTION_POSTPAID";
}

export interface CreateOrderInput {
  amountCents: number;
  currency: string;
  customId?: string;
  description?: string;
  kind: "topup" | "spend" | "charge" | "approval";
  purseId?: string;
  spendRequestId?: string;
  ownerId?: string;
  intentId?: string;
  payeeEmail?: string;
  vaultId?: string;
  storedCredential?: StoredCredential;
}

export interface SetupToken {
  id: string;
  status: "PAYER_ACTION_REQUIRED" | "APPROVED";
  customerId?: string;
  links: PaypalLink[];
}

export interface PaymentToken {
  id: string;
  status: "ACTIVE" | "DELETED";
  customerId: string;
  payerEmail?: string;
}

export interface PayPalClient {
  readonly mode: "mock" | "live";
  createSetupToken(input: { ownerId: string; returnUrl: string; cancelUrl: string; description: string }): Promise<SetupToken>;
  approveSetupToken(setupTokenId: string): Promise<SetupToken>;
  createPaymentToken(setupTokenId: string): Promise<PaymentToken>;
  deletePaymentToken(paymentTokenId: string): Promise<void>;
  getPaymentToken(paymentTokenId: string): Promise<PaymentToken>;
  createOrder(input: CreateOrderInput): Promise<PaypalOrder>;
  getOrder(orderId: string): Promise<PaypalOrder>;
  approveOrder(orderId: string): Promise<PaypalOrder>;
  captureOrder(orderId: string): Promise<PaypalOrder>;
  refundCapture(captureId: string, amountCents?: number): Promise<PaypalRefund>;
  verifyWebhookSignature(input: WebhookVerifyInput): Promise<boolean>;
}

export interface WebhookVerifyInput {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookId: string;
  rawBody: string;
  event: unknown;
}

export class PayPalError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
  }
}
