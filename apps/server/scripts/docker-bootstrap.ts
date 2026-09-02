import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySpansRetention,
  clickHouseConfigFromEnv,
  createClickHouseClient,
  runMigrations,
} from "@foglamp/clickhouse";
import { db } from "@foglamp/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));

console.log("▶ Postgres: applying Drizzle migrations…");
await migrate(db, {
  migrationsFolder: path.resolve(here, "../../../packages/db/src/migrations"),
});
console.log("✓ Postgres migrations applied");

console.log("▶ ClickHouse: applying DDL migrations + retention…");
const ch = createClickHouseClient(await clickHouseConfigFromEnv());
const applied = await runMigrations(ch, {
  onProgress: (e) => {
    if (e.phase === "start") console.log(`  • ${e.id} (${e.index + 1}/${e.total})…`);
  },
});
await applySpansRetention(ch);
await ch.close();
console.log(
  `✓ ClickHouse ready (${applied.length ? `applied ${applied.join(", ")}` : "already up to date"})`,
);

console.log("▶ Seeding…");
const seed = spawnSync("bun", ["run", path.join(here, "seed.ts")], {
  stdio: "inherit",
});
if (seed.error) throw seed.error;
process.exit(seed.status ?? 0);
