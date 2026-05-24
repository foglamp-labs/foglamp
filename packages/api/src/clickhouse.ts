import { createClickHouseClient } from "@watchtower/clickhouse";
import { env } from "@watchtower/env/server";

// Single ClickHouse client shared across the dashboard API (reads only). The
// ingest service owns writes; the dashboard never inserts. Built from the same
// CLICKHOUSE_* env as ingest so both point at the same cluster.
export const ch = createClickHouseClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
});
