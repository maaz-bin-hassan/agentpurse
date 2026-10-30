import { createHash, randomBytes } from "node:crypto";
import { newId } from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function registerClient(sql: Sql, input: { clientName: string; redirectUris: string[] }) {
  const id = newId("oauth");
  const secret = randomBytes(24).toString("base64url");
  await sql.exec(
    `INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, sha256(secret), input.clientName, JSON.stringify(input.redirectUris), new Date().toISOString()],
  );
  return { client_id: id, client_secret: secret, redirect_uris: input.redirectUris };
}

export async function issueCode(
  sql: Sql,
  input: { clientId: string; ownerId: string; redirectUri: string; codeChallenge: string; method: string; scope: string },
) {
  const client = await sql.get("SELECT redirect_uris FROM oauth_clients WHERE id = ?", [input.clientId]);
  if (!client) throw new Error("Unknown client");
  const uris = JSON.parse(String(client.redirect_uris)) as string[];
  if (!uris.includes(input.redirectUri)) throw new Error("redirect_uri is not registered");
  if (input.method !== "S256") throw new Error("Only S256 PKCE is supported");
  const code = randomBytes(24).toString("base64url");
  await sql.exec(
    `INSERT INTO oauth_codes (code, client_id, owner_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, input.clientId, input.ownerId, input.redirectUri, input.codeChallenge, input.method, input.scope, new Date(Date.now() + 10 * 60 * 1000).toISOString()],
  );
  return code;
}

export async function exchangeCode(sql: Sql, input: { code: string; verifier: string; redirectUri: string; clientId: string }) {
  const row = await sql.get("SELECT * FROM oauth_codes WHERE code = ?", [input.code]);
  if (!row) throw new Error("Unknown code");
  if (String(row.client_id) !== input.clientId) throw new Error("client_id mismatch");
  if (String(row.redirect_uri) !== input.redirectUri) throw new Error("redirect_uri mismatch");
  if (String(row.expires_at) < new Date().toISOString()) throw new Error("Code expired");
  if (codeChallenge(input.verifier) !== String(row.code_challenge)) throw new Error("PKCE verification failed");
  await sql.exec("DELETE FROM oauth_codes WHERE code = ?", [input.code]);
  const access = randomBytes(24).toString("base64url");
  const refresh = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await sql.exec(
    `INSERT INTO oauth_tokens (token_hash, kind, client_id, owner_id, agent_id, scope, expires_at, refresh_hash) VALUES (?, 'access', ?, ?, NULL, ?, ?, ?)`,
    [sha256(access), input.clientId, String(row.owner_id), String(row.scope), expires, sha256(refresh)],
  );
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: String(row.scope) };
}
