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

export function healthPayload(env: AppEnv = process.env) {
  const paypal = paypalMode(env);
  const ai = aiMode(env);
  return {
    ok: true as const,
    service: "agentpurse",
    paypalMode: paypal,
    aiMode: ai,
    credentialsRequired: false,
    livePaypalConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    liveAiConfigured: Boolean(env.GROQ_API_KEY || env.GEMINI_API_KEY),
  };
}
