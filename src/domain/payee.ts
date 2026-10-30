export const DEMO_PAYEE = "sb-merchant@business.example.com";

export function merchantPayee(env: { PAYPAL_MERCHANT_EMAIL?: string } | NodeJS.ProcessEnv = process.env): string {
  return env.PAYPAL_MERCHANT_EMAIL?.trim() || DEMO_PAYEE;
}
