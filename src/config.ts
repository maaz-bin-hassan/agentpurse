export type PaypalMode = "mock" | "live";
export type AiMode = "mock" | "live";
export type AiProvider = "groq" | "gemini";

export function paypalMode(env: NodeJS.ProcessEnv = process.env): PaypalMode {
  return env.PAYPAL_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  return env.AI_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  return env.AI_PROVIDER?.toLowerCase() === "gemini" ? "gemini" : "groq";
}

export function healthPayload(env: NodeJS.ProcessEnv = process.env) {
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
