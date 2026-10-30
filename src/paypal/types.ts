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
    amount: PaypalAmount;
    payments?: {
      captures?: PaypalCapture[];
      refunds?: PaypalRefund[];
    };
  }>;
  links: PaypalLink[];
  create_time: string;
  update_time: string;
}

export interface CreateOrderInput {
  amountCents: number;
  currency: string;
  customId?: string;
  description?: string;
  kind: "topup" | "spend";
  purseId?: string;
  spendRequestId?: string;
}

export interface PayPalClient {
  readonly mode: "mock" | "live";
  createOrder(input: CreateOrderInput): Promise<PaypalOrder>;
  getOrder(orderId: string): Promise<PaypalOrder>;
  approveOrder(orderId: string): Promise<PaypalOrder>;
  captureOrder(orderId: string): Promise<PaypalOrder>;
  refundCapture(captureId: string, amountCents?: number): Promise<PaypalRefund>;
}

export class PayPalError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
  }
}
