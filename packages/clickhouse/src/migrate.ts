import type { ClickHouseClient } from "@clickhouse/client";

import { MIGRATIONS } from "./migrations";

const MIGRATIONS_TABLE = "schema_migrations";

async function ensureMigrationsTable(client: ClickHouseClient): Promise<void> {
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}
(
  id String,
  applied_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(applied_at)
ORDER BY id`,
  });
}

async function appliedIds(client: ClickHouseClient): Promise<Set<string>> {
  const rs = await client.query({
    query: `SELECT id FROM ${MIGRATIONS_TABLE} FINAL`,
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ id: string }>();
  return new Set(rows.map((r) => r.id));
}

/**
 * Apply all pending DDL migrations in order. Idempotent: previously-applied
 * ids are skipped and every statement is itself IF NOT EXISTS. Safe to call on
 * every ingest boot and from the docker entrypoint.
 */
export async function runMigrations(client: ClickHouseClient): Promise<string[]> {
  await ensureMigrationsTable(client);
  const done = await appliedIds(client);
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await client.command({ query: statement });
    }
    await client.insert({
      table: MIGRATIONS_TABLE,
      values: [{ id: migration.id }],
      format: "JSONEachRow",
    });
    applied.push(migration.id);
  }
  return applied;
}

/**
 * Set the spans retention window via ALTER … MODIFY TTL (mutable, online).
 * Called on boot with WATCHTOWER_SPANS_RETENTION_DAYS. A value <= 0 removes
 * the TTL (keep forever).
 */
export async function applySpansRetention(
  client: ClickHouseClient,
  days: number,
): Promise<void> {
  if (!Number.isFinite(days) || days <= 0) {
    await client.command({ query: `ALTER TABLE spans REMOVE TTL` });
    return;
  }
  await client.command({
    query: `ALTER TABLE spans MODIFY TTL toDateTime(start_time) + INTERVAL ${Math.floor(days)} DAY`,
  });
}
