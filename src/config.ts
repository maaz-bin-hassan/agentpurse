export type PaypalMode = "mock" | "live";
export type AiMode = "mock" | "live";
export type AiProvider = "groq" | "gemini";

export type AppEnv = Record<string, string | undefined>;

export function paypalMode(env: AppEnv = process.env): PaypalMode {
  return env.PAYPAL_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiMode(env: AppEnv = process.env): AiMode {
  return env.AI_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiProvider(env: AppEnv = process.env): AiProvider {
  return env.AI_PROVIDER?.toLowerCase() === "gemini" ? "gemini" : "groq";
}

/** A public demo on the PayPal sandbox. It can never point at PayPal's production host. */
export function sandboxDemo(env: AppEnv = process.env): boolean {
  if (paypalMode(env) !== "live" || env.AGENTPURSE_SANDBOX_DEMO !== "1" || !env.DEMO_SESSION_SECRET) return false;
  const base = env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
  try {
    return new URL(base).hostname === "api-m.sandbox.paypal.com";
  } catch {
    return false;
  }
}

/** Mock and the sandbox demo let the signed-in owner sign from the dashboard. Real live mode needs a passkey. */
export function dashboardSignatureAllowed(env: AppEnv = process.env): boolean {
  return paypalMode(env) === "mock" || sandboxDemo(env);
}

export function healthPayload(env: AppEnv = process.env) {
  const paypal = paypalMode(env);
  const ai = aiMode(env);
  return {
    ok: true as const,
    service: "agentpurse",
    paypalMode: paypal,
    sandboxDemo: sandboxDemo(env),
    aiMode: ai,
    credentialsRequired: false,
    livePaypalConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    liveAiConfigured: Boolean(env.GROQ_API_KEY || env.GEMINI_API_KEY),
  };
}
