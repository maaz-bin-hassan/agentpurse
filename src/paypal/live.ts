import { randomUUID } from "node:crypto";
import { centsToDecimal } from "@/src/domain/money";
import {
  PayPalError,
  type CreateOrderInput,
  type PayPalClient,
  type PaypalOrder,
  type PaypalRefund,
  type SetupToken,
} from "@/src/paypal/types";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 400) || response.statusText;
}

export function createLivePayPal(options: {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): PayPalClient {
  const base = (options.baseUrl ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  let tokenCache: { value: string; exp: number } | null = null;

  async function accessToken(): Promise<string> {
    if (tokenCache && tokenCache.exp > Date.now() + 5000) return tokenCache.value;
    const auth = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!response.ok) {
      throw new PayPalError(`PayPal auth failed (${response.status}): ${await readError(response)}`, response.status);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new PayPalError("PayPal auth response did not include a token.");
    tokenCache = {
      value: json.access_token,
      exp: Date.now() + (json.expires_in ?? 60) * 1000,
    };
    return json.access_token;
  }

  async function paypal<T>(path: string, init: RequestInit): Promise<T> {
    const token = await accessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    if (!headers.has("PayPal-Request-Id") && init.method && init.method !== "GET") {
      headers.set("PayPal-Request-Id", randomUUID());
    }
    const response = await fetchImpl(`${base}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new PayPalError(`PayPal ${path} failed (${response.status}): ${await readError(response)}`, response.status);
    }
    return (await response.json()) as T;
  }

  return {
    mode: "live",
    async createSetupToken(input) {
      return paypal<SetupToken>("/v3/vault/setup-tokens", {
        method: "POST",
        body: JSON.stringify({
          payment_source: {
            paypal: {
              description: input.description,
              usage_pattern: "IMMEDIATE",
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
              experience_context: {
                brand_name: "AgentPurse",
                locale: "en-US",
                return_url: input.returnUrl,
                cancel_url: input.cancelUrl,
              },
            },
          },
        }),
      });
    },
    async approveSetupToken(setupTokenId) {
      const token = await paypal<SetupToken>(`/v3/vault/setup-tokens/${encodeURIComponent(setupTokenId)}`, { method: "GET" });
      if (token.status === "APPROVED") return token;
      const link = token.links?.find((item) => item.rel === "approve");
      throw new PayPalError(link ? `Payer approval happens at PayPal: ${link.href}` : `Setup token ${setupTokenId} is not approved.`);
    },
    async createPaymentToken(setupTokenId) {
      const created = await paypal<{ id: string; customer?: { id?: string }; payment_source?: { paypal?: { email_address?: string } } }>(
        "/v3/vault/payment-tokens",
        {
          method: "POST",
          body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } }),
        },
      );
      return {
        id: created.id,
        status: "ACTIVE" as const,
        customerId: created.customer?.id ?? "",
        payerEmail: created.payment_source?.paypal?.email_address,
      };
    },
    async getPaymentToken(paymentTokenId) {
      const token = await paypal<{ id: string; customer?: { id?: string }; payment_source?: { paypal?: { email_address?: string } } }>(
        `/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`,
        { method: "GET" },
      );
      return {
        id: token.id,
        status: "ACTIVE" as const,
        customerId: token.customer?.id ?? "",
        payerEmail: token.payment_source?.paypal?.email_address,
      };
    },
    async deletePaymentToken(paymentTokenId) {
      const token = await accessToken();
      const response = await fetchImpl(`${base}/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status !== 204 && !response.ok) {
        throw new PayPalError(`PayPal vault delete failed (${response.status}): ${await readError(response)}`, response.status);
      }
    },
    async createOrder(input: CreateOrderInput): Promise<PaypalOrder> {
      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new PayPalError("Amount must be a positive number of cents.", 422);
      }
      return paypal<PaypalOrder>("/v2/checkout/orders", {
        method: "POST",
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              custom_id: input.customId,
              description: input.description,
              payee: input.payeeEmail ? { email_address: input.payeeEmail } : undefined,
              amount: {
                currency_code: input.currency,
                value: centsToDecimal(input.amountCents),
              },
            },
          ],
          payment_source: input.vaultId
            ? {
                paypal: {
                  vault_id: input.vaultId,
                  stored_credential: input.storedCredential,
                },
              }
            : undefined,
        }),
      });
    },
    async getOrder(orderId: string): Promise<PaypalOrder> {
      return paypal<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
    },
    async approveOrder(orderId: string): Promise<PaypalOrder> {
      const order = await this.getOrder(orderId);
      if (order.status === "APPROVED" || order.status === "COMPLETED") return order;
      const link = order.links.find((item) => item.rel === "approve");
      throw new PayPalError(
        link
          ? `Buyer approval happens at PayPal: ${link.href}`
          : `Order ${orderId} is ${order.status} and is not approved.`,
      );
    },
    async captureOrder(orderId: string): Promise<PaypalOrder> {
      return paypal<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        body: "{}",
      });
    },
    async verifyWebhookSignature(input) {
      const result = await paypal<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: input.authAlgo,
          cert_url: input.certUrl,
          transmission_id: input.transmissionId,
          transmission_sig: input.transmissionSig,
          transmission_time: input.transmissionTime,
          webhook_id: input.webhookId,
          webhook_event: input.event,
        }),
      });
      return result.verification_status === "SUCCESS";
    },
    async refundCapture(captureId: string, amountCents?: number): Promise<PaypalRefund> {
      const body =
        amountCents == null
          ? "{}"
          : JSON.stringify({
              amount: { currency_code: "USD", value: centsToDecimal(amountCents) },
            });
      return paypal<PaypalRefund>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: "POST",
        body,
      });
    },
  };
}
