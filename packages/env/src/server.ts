import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const serverSchema = {
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  CORS_EXTRA_ORIGINS: z.string().optional(),
  // Optional: email (magic-link, alert notifications) is enabled only when set.
  // An email-less self-host logs in via the seeded email+password admin.
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Injected by the host (Cloud Run, Railway, Fly.io, …); 3000 for local dev.
  PORT: z.coerce.number().default(3000),

  // --- ClickHouse (span store) ---
  CLICKHOUSE_URL: z.string().min(1).default("http://localhost:8123"),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
  CLICKHOUSE_DATABASE: z.string().default("foglamp"),

  // --- Cost / pricing (@foglamp/cost) ---
  OPENROUTER_MODELS_URL: z.url().default("https://openrouter.ai/api/v1/models"),
  // Optional local pricing JSON for air-gapped deployments.
  FOGLAMP_PRICING_FILE: z.string().optional(),

  // --- apps/ingest ---
  INGEST_PORT: z.coerce.number().default(4000),
  INGEST_FLUSH_INTERVAL_MS: z.coerce.number().default(1000),
  INGEST_FLUSH_MAX_ROWS: z.coerce.number().default(1000),
  INGEST_RATE_LIMIT_RPS: z.coerce.number().default(100),
  API_KEY_CACHE_TTL_MS: z.coerce.number().default(60_000),

  // Span retention; applied via ALTER TABLE … MODIFY TTL on boot.
  FOGLAMP_SPANS_RETENTION_DAYS: z.coerce.number().default(30),

  // --- Alerts (evaluator cron in apps/server) ---
  // How often the evaluator sweeps enabled rules; default every 60s.
  ALERT_EVAL_INTERVAL_MS: z.coerce.number().default(60_000),
  // Re-notify cooldown while a rule stays firing; default 1h.
  ALERT_RENOTIFY_MS: z.coerce.number().default(3_600_000),

  // --- Evals (scoring worker in apps/server; BYOK) ---
  // 32+ char secret used to AES-256-GCM encrypt provider API keys at rest.
  // Absent → the provider-keys feature is disabled (the self-host enable gate).
  FOGLAMP_SECRETS_KEY: z.string().min(32).optional(),
  // How often the scoring worker sweeps enabled evals; default every 60s.
  SCORING_EVAL_INTERVAL_MS: z.coerce.number().default(60_000),
  // Don't score spans newer than this, so late spans/merges settle first.
  SCORING_SETTLE_MS: z.coerce.number().default(60_000),
  // Max judge calls in flight, and max targets scored per eval per tick.
  EVAL_JUDGE_CONCURRENCY: z.coerce.number().default(5),
  EVAL_SCORING_BATCH: z.coerce.number().default(100),

  // --- Billing (Stripe; org-scoped). Plugin enabled only when the secret is set. ---
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_PRO_ANNUAL: z.string().optional(),
  // How often to sweep orgs for the 90% span-quota warning email; default 1h.
  QUOTA_WARN_INTERVAL_MS: z.coerce.number().default(3_600_000),

  // --- Optional Google OAuth (enabled only when both are present) ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // --- Seed script bootstrap (no static defaults; random if unset) ---
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // # If using QStash
  // QSTASH_URL: z.string().min(1),
  // QSTASH_TOKEN: z.string().min(1),
  // QSTASH_CALLBACK_URL: z.url().optional(),
  // QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  // QSTASH_NEXT_SIGNING_KEY: z.string().min(1),

  // # If using CRONs
  // CRON_SECRET: z.string().min(1),

  // --- Foggy (in-app AI assistant) ---
  // Foggy is enabled only when a Google key is present; otherwise the chat
  // reports that it isn't configured.
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  FOGGY_MODEL: z.string().default("gemini-3.1-flash-lite"),
  // Optional docs-search tool (Exa); no-ops when unset.
  EXA_API_KEY: z.string().min(1).optional(),
  FOGGY_DOCS_URL: z.url().default("https://docs.foglamp.dev"),
  // Cost guardrails.
  FOGGY_RPM: z.coerce.number().default(15),
  FOGGY_DAILY_LIMIT: z.coerce.number().default(200),
  FOGGY_MAX_STEPS: z.coerce.number().default(6),
  FOGGY_MAX_OUTPUT_TOKENS: z.coerce.number().default(1500),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
};

export const env = createEnv<undefined, typeof serverSchema>({
  server: serverSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function addOriginWithVariants(origins: Set<string>, rawOrigin: string) {
  const originUrl = new URL(rawOrigin);
  const hostname = originUrl.hostname.toLowerCase();

  originUrl.hostname = hostname;
  origins.add(originUrl.origin);

  if (isLocalHostname(hostname)) {
    return;
  }

  if (hostname.startsWith("www.")) {
    const alternateUrl = new URL(originUrl.origin);
    alternateUrl.hostname = hostname.slice(4);
    origins.add(alternateUrl.origin);
  } else if (hostname.split(".").length === 2) {
    const alternateUrl = new URL(originUrl.origin);
    alternateUrl.hostname = `www.${hostname}`;
    origins.add(alternateUrl.origin);
  }
}

function parseAdditionalOrigins(rawOrigins?: string | null) {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getTrustedAppOrigins(
  primaryOrigin: string,
  additionalOrigins?: string | null
) {
  const origins = new Set<string>();

  addOriginWithVariants(origins, primaryOrigin);

  for (const origin of parseAdditionalOrigins(additionalOrigins)) {
    addOriginWithVariants(origins, origin);
  }

  return Array.from(origins);
}
