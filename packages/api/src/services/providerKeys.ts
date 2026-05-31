import { TRPCError } from "@trpc/server";
import { providerCredential } from "@foglamp/db/schema/eval";
import { and, eq } from "drizzle-orm";

import { encryptSecret, isSecretsConfigured } from "../lib/crypto";
import type { Db } from "../types";
import { requireProjectAccess } from "./access";

export type ProviderName = "google" | "openai" | "anthropic";

// BYOK provider keys. Plaintext is encrypted on write and NEVER returned —
// callers only ever see which providers are configured.

export async function listProviderKeys(db: Db, userId: string, projectId: string) {
  await requireProjectAccess(db, userId, projectId);
  const rows = await db
    .select({
      provider: providerCredential.provider,
      label: providerCredential.label,
      createdAt: providerCredential.createdAt,
      updatedAt: providerCredential.updatedAt,
    })
    .from(providerCredential)
    .where(eq(providerCredential.projectId, projectId));
  return {
    // Gates the feature: without a server secret we can't encrypt keys at rest.
    secretsConfigured: isSecretsConfigured(),
    keys: rows.map((r) => ({
      provider: r.provider,
      label: r.label,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

export async function upsertProviderKey(
  db: Db,
  userId: string,
  input: { projectId: string; provider: ProviderName; key: string; label?: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  if (!isSecretsConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Provider keys are disabled — set FOGLAMP_SECRETS_KEY to enable.",
    });
  }
  const enc = encryptSecret(input.key.trim());
  await db
    .insert(providerCredential)
    .values({
      projectId: input.projectId,
      provider: input.provider,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      keyVersion: enc.keyVersion,
      label: input.label,
    })
    .onConflictDoUpdate({
      target: [providerCredential.projectId, providerCredential.provider],
      set: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyVersion: enc.keyVersion,
        label: input.label,
      },
    });
  return { provider: input.provider };
}

export async function deleteProviderKey(
  db: Db,
  userId: string,
  input: { projectId: string; provider: ProviderName },
) {
  await requireProjectAccess(db, userId, input.projectId);
  await db
    .delete(providerCredential)
    .where(
      and(
        eq(providerCredential.projectId, input.projectId),
        eq(providerCredential.provider, input.provider),
      ),
    );
  return { provider: input.provider };
}
