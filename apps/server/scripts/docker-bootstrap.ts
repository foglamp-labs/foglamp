// One-shot self-host bootstrap, run by the `migrate` compose service before the
// long-running tiers start. Idempotent end to end:
//   1. Postgres — apply Drizzle migrations.
//   2. ClickHouse — apply DDL migrations + set the spans retention TTL.
//   3. Seed — admin user → org → project → API key (prints secrets once).
// Each step is safe to re-run, so `docker compose up` after an upgrade just
// applies what's new.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySpansRetention,
  clickHouseConfigFromEnv,
  createClickHouseClient,
  runMigrations,
} from "@watchtower/clickhouse";
import { db } from "@watchtower/db";
import { env } from "@watchtower/env/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));

console.log("▶ Postgres: applying Drizzle migrations…");
await migrate(db, {
  migrationsFolder: path.resolve(here, "../../../packages/db/src/migrations"),
});
console.log("✓ Postgres migrations applied");

console.log("▶ ClickHouse: applying DDL migrations + retention…");
const ch = createClickHouseClient(await clickHouseConfigFromEnv());
const applied = await runMigrations(ch);
await applySpansRetention(ch, env.WATCHTOWER_SPANS_RETENTION_DAYS);
await ch.close();
console.log(
  `✓ ClickHouse ready (${applied.length ? `applied ${applied.join(", ")}` : "already up to date"}; retention ${env.WATCHTOWER_SPANS_RETENTION_DAYS}d)`,
);

console.log("▶ Seeding…");
const seed = spawnSync("bun", ["run", path.join(here, "seed.ts")], {
  stdio: "inherit",
});
if (seed.error) throw seed.error;
process.exit(seed.status ?? 0);
