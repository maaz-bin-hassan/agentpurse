import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { formatMoney } from "@/src/domain/money";
import {
  getCredential,
  getIntent,
  getOwner,
  listCredentials,
  newId,
  saveChallenge,
  saveCredential,
  setCredentialCounter,
  takeChallenge,
} from "@/src/db/repository";
import type { Sql } from "@/src/db/sql";
import type { IntentRecord } from "@/src/domain/types";

export function webauthnConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    rpID: env.WEBAUTHN_RP_ID || "localhost",
    rpName: "AgentPurse",
    origin: env.WEBAUTHN_ORIGIN || "http://localhost:3000",
  };
}

export function approvalPush(intent: Pick<IntentRecord, "id" | "merchantName" | "amountCents" | "currency">) {
  return {
    title: `Approve ${intent.merchantName ?? "a payment"}?`,
    body: `${formatMoney(intent.amountCents ?? 0, intent.currency ?? "USD")} is waiting. Confirm with your passkey, or approve at PayPal.`,
    intentId: intent.id,
    url: "/purses/purse_maya",
  };
}

export async function registrationOptions(sql: Sql, ownerId: string) {
  const owner = await getOwner(sql, ownerId);
  if (!owner) throw new Error("Unknown household");
  const config = webauthnConfig();
  const existing = await listCredentials(sql, ownerId);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: owner.email,
    userDisplayName: owner.name,
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({ id: String(row.credential_id) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await saveChallenge(sql, {
    id: newId("chal"),
    ownerId,
    intentId: null,
    challenge: options.challenge,
    kind: "registration",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return options;
}

export async function verifyRegistration(sql: Sql, ownerId: string, response: RegistrationResponseJSON) {
  const challenge = await takeChallenge(sql, ownerId, "registration");
  if (!challenge) throw new Error("No registration challenge is waiting");
  const config = webauthnConfig();
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge: String(challenge.challenge),
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
  });
  if (!verified.verified || !verified.registrationInfo) throw new Error("Passkey registration was rejected");
  await saveCredential(sql, {
    id: newId("cred"),
    ownerId,
    credentialId: verified.registrationInfo.credential.id,
    publicKey: Buffer.from(verified.registrationInfo.credential.publicKey).toString("base64url"),
    counter: verified.registrationInfo.credential.counter,
    transports: response.response.transports?.join(",") ?? null,
    deviceType: verified.registrationInfo.credentialDeviceType,
    backedUp: verified.registrationInfo.credentialBackedUp,
    createdAt: new Date().toISOString(),
  });
  return { verified: true };
}

export async function authenticationOptions(sql: Sql, ownerId: string, intentId: string) {
  const credentials = await listCredentials(sql, ownerId);
  const config = webauthnConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: credentials.map((row) => ({ id: String(row.credential_id) })),
    userVerification: "preferred",
  });
  await saveChallenge(sql, {
    id: newId("chal"),
    ownerId,
    intentId,
    challenge: options.challenge,
    kind: "authentication",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return options;
}

export async function verifyAuthentication(sql: Sql, ownerId: string, response: AuthenticationResponseJSON) {
  const challenge = await takeChallenge(sql, ownerId, "authentication");
  if (!challenge) throw new Error("No approval challenge is waiting");
  const credential = await getCredential(sql, response.id);
  if (!credential || String(credential.owner_id) !== ownerId) throw new Error("Unknown passkey");
  const config = webauthnConfig();
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: String(challenge.challenge),
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: String(credential.credential_id),
      publicKey: Buffer.from(String(credential.public_key), "base64url"),
      counter: Number(credential.counter),
      transports: credential.transports ? String(credential.transports).split(",") : undefined,
    },
  });
  if (!verified.verified) throw new Error("Passkey confirmation was rejected");
  await setCredentialCounter(sql, response.id, verified.authenticationInfo.newCounter);
  return { verified: true, intentId: challenge.intent_id ? String(challenge.intent_id) : null };
}
