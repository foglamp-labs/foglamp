import { type ClickHouseClient, createClient } from "@clickhouse/client";

export type { ClickHouseClient } from "@clickhouse/client";

export type ClickHouseConfig = {
  url: string;
  username: string;
  password: string;
  database: string;
};

/**
 * Create a ClickHouse client. Reads CLICKHOUSE_* from the server env when no
 * config is passed (the common case for ingest/server); an explicit config is
 * used by the migration runner and tests.
 */
export function createClickHouseClient(
  config?: Partial<ClickHouseConfig>,
): ClickHouseClient {
  return createClient({
    url: config?.url,
    username: config?.username,
    password: config?.password,
    database: config?.database,
    // Spans are written in bulk by ingest; let the server batch async inserts
    // is handled application-side, so keep request-level defaults conservative.
    clickhouse_settings: {
      // Wait for the insert to be written before acking (durability over
      // throughput; ingest already batches).
      async_insert: 0,
    },
  });
}

/** Build a client config from the validated server env. */
export async function clickHouseConfigFromEnv(): Promise<ClickHouseConfig> {
  const { env } = await import("@watchtower/env/server");
  return {
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DATABASE,
  };
}
