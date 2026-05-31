import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "@foglamp/env/server";

// AES-256-GCM encryption for secrets at rest (BYOK provider keys). The 32-byte
// key is derived from FOGLAMP_SECRETS_KEY via sha256, so any 32+ char secret
// works. There is no existing crypto helper in the repo (api keys are only
// hashed, never decrypted) — this is the first reversible-secret store.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
export const SECRETS_KEY_VERSION = 1;

export type EncryptedSecret = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
};

/** True when FOGLAMP_SECRETS_KEY is set — gates the provider-keys feature. */
export function isSecretsConfigured(): boolean {
  return !!env.FOGLAMP_SECRETS_KEY;
}

function requireKey(): Buffer {
  const secret = env.FOGLAMP_SECRETS_KEY;
  if (!secret) {
    throw new Error(
      "FOGLAMP_SECRETS_KEY is not set — cannot encrypt/decrypt provider keys.",
    );
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: SECRETS_KEY_VERSION,
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = requireKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(), // throws if the auth tag fails (tampered/ wrong key)
  ]);
  return plaintext.toString("utf8");
}
