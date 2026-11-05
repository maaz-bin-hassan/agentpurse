export type PaypalMode = "mock" | "live";
export type AiMode = "mock" | "live";
export type AiProvider = "groq" | "gemini" | "deepseek";
export type Channel3Mode = "mock" | "live";

export type AppEnv = Record<string, string | undefined>;

export function paypalMode(env: AppEnv = process.env): PaypalMode {
  return env.PAYPAL_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiMode(env: AppEnv = process.env): AiMode {
  return env.AI_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function channel3Mode(env: AppEnv = process.env): Channel3Mode {
  return env.CHANNEL3_MODE?.toLowerCase() === "live" ? "live" : "mock";
}

export function aiProvider(env: AppEnv = process.env): AiProvider {
  const provider = env.AI_PROVIDER?.toLowerCase();
  return provider === "gemini" || provider === "deepseek" ? provider : "groq";
}

/** Groq and DeepSeek speak the same OpenAI-style chat API. */
export const CHAT_PROVIDERS = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", keyName: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", label: "Groq" },
  deepseek: { url: "https://api.deepseek.com/chat/completions", keyName: "DEEPSEEK_API_KEY", model: "deepseek-chat", label: "DeepSeek" },
} as const;

export function aiKey(env: AppEnv = process.env, provider: AiProvider = aiProvider(env)): string | undefined {
  return provider === "gemini" ? env.GEMINI_API_KEY : env[CHAT_PROVIDERS[provider].keyName];
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
    aiProvider: aiProvider(env),
    channel3Mode: channel3Mode(env),
    channel3Configured: Boolean(env.CHANNEL3_API_KEY),
    credentialsRequired: false,
    livePaypalConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    liveAiConfigured: Boolean(aiKey(env)),
  };
}
