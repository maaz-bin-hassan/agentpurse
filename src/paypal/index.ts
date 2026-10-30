import type { DatabaseSync } from "node:sqlite";
import { paypalMode, type AppEnv } from "@/src/config";
import { createLivePayPal } from "@/src/paypal/live";
import { createMockPayPal } from "@/src/paypal/mock";
import type { PayPalClient } from "@/src/paypal/types";

export function createPayPalClient(db: DatabaseSync, env: AppEnv = process.env): PayPalClient {
  if (paypalMode(env) === "live") {
    const clientId = env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "PAYPAL_MODE=live requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Leave PAYPAL_MODE unset to use the mock.",
      );
    }
    return createLivePayPal({
      clientId,
      clientSecret,
      baseUrl: env.PAYPAL_API_BASE,
    });
  }
  return createMockPayPal(db);
}

export { PayPalError } from "@/src/paypal/types";
export type { PayPalClient, PaypalOrder, PaypalRefund } from "@/src/paypal/types";
