export const DEMO_COOKIE = "ap_demo";

export function demoSessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.DEMO_SESSION_SECRET) return env.DEMO_SESSION_SECRET;
  if (env.PAYPAL_MODE === "live") return null;
  return "agentpurse-mock-demo-session";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function mac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signDemoSession(ownerId: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const secret = demoSessionSecret(env);
  if (!secret) return null;
  const body = bytesToBase64Url(new TextEncoder().encode(ownerId));
  return `${body}.${await mac(secret, body)}`;
}

export async function readDemoSession(token: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const secret = demoSessionSecret(env);
  if (!secret || !token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = await mac(secret, body);
  const a = base64UrlToBytes(signature);
  const b = base64UrlToBytes(expected);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  return new TextDecoder().decode(base64UrlToBytes(body));
}
