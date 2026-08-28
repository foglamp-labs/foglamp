import { env } from "@foglamp/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

// Per-process pool cap. Cloud SQL's small tiers allow 50 connections total and
// a deploy briefly runs old and new revisions of every service side by side,
// so node-postgres's default of 10 per process can exhaust the instance.
const POOL_MAX = 5;

export function createDb() {
  return drizzle({
    connection: { connectionString: env.DATABASE_URL, max: POOL_MAX },
    schema,
  });
}

export const db = createDb();
