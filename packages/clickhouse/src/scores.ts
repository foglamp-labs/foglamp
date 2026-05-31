import type { ClickHouseClient } from "@clickhouse/client";

import { toClickHouseDateTime64 } from "./spans";

// A ClickHouse-shaped score row (snake_case keys match the `scores` columns for
// JSONEachRow inserts). The scoring worker builds these. `scored_at` is epoch
// milliseconds, converted to a DateTime64(3) literal on insert.
export type ScoreRow = {
  project_id: string;
  eval_id: string;
  score_id: string; // deterministic `${eval_id}:${target_id}` → dedup on re-run
  target_type: string; // 'trace' | 'span'
  target_id: string;
  trace_id: string;
  scorer: string; // 'code' | 'llm'
  label: string;
  score: number | null;
  passed: number | null; // 1 | 0 | null
  reason: string;
  model_id: string;
  cost: string | null; // decimal string
  scored_at: number; // epoch ms
};

function toInsertRow(row: ScoreRow): Record<string, unknown> {
  return { ...row, scored_at: toClickHouseDateTime64(row.scored_at) };
}

/**
 * Purge all rows for a project (spans + scores) — ClickHouse has no FKs, so a
 * Postgres project delete must call this. Async lightweight mutations; the
 * summary MVs are left (they're never queried for a deleted project).
 */
export async function deleteProjectData(
  client: ClickHouseClient,
  projectId: string,
): Promise<void> {
  for (const table of ["spans", "scores"]) {
    await client.command({
      query: `ALTER TABLE ${table} DELETE WHERE project_id = {projectId:String}`,
      query_params: { projectId },
    });
  }
}

/** Bulk-insert scores. The scoring worker calls this each tick. */
export async function insertScores(
  client: ClickHouseClient,
  rows: ScoreRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: "scores",
    values: rows.map(toInsertRow),
    format: "JSONEachRow",
    clickhouse_settings: { date_time_input_format: "best_effort" },
  });
}
