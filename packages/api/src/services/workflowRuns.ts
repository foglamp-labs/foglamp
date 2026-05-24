import {
  listTracesByWorkflowRun,
  listWorkflowRuns,
} from "@watchtower/clickhouse";
import { workflowRunName } from "@watchtower/db/schema/workflowRun";
import { and, eq, inArray } from "drizzle-orm";

import { decimalOrNull, num } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

export async function getWorkflowRunList(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; limit?: number; offset?: number },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const runs = await listWorkflowRuns(ch, input);

  // Overlay user-assigned display names (absence → raw run id in the UI).
  const ids = runs.map((r) => r.workflow_run_id).filter(Boolean);
  const names =
    ids.length > 0
      ? await db
          .select({
            workflowRunId: workflowRunName.workflowRunId,
            name: workflowRunName.name,
          })
          .from(workflowRunName)
          .where(
            and(
              eq(workflowRunName.projectId, input.projectId),
              inArray(workflowRunName.workflowRunId, ids),
            ),
          )
      : [];
  const nameById = new Map(names.map((n) => [n.workflowRunId, n.name]));

  return runs.map((r) => ({
    workflowRunId: r.workflow_run_id,
    workflowName: r.workflow_name || null,
    displayName: nameById.get(r.workflow_run_id) ?? null,
    startTime: r.run_start,
    endTime: r.run_end,
    durationMs: num(r.duration_ms),
    traceCount: num(r.trace_count),
    spanCount: num(r.span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
  }));
}

/** Set/replace the display name for a run (upsert on (projectId, runId)). */
export async function renameWorkflowRun(
  db: Db,
  userId: string,
  input: { projectId: string; workflowRunId: string; name: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  await db
    .insert(workflowRunName)
    .values({
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      name: input.name,
      renamedBy: userId,
    })
    .onConflictDoUpdate({
      target: [workflowRunName.projectId, workflowRunName.workflowRunId],
      set: { name: input.name, renamedBy: userId },
    });
  return { workflowRunId: input.workflowRunId, name: input.name };
}

/** Traces inside one run (the run timeline), with its display name. */
export async function getWorkflowRunDetail(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; workflowRunId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);

  const nameRows = await db
    .select({ name: workflowRunName.name })
    .from(workflowRunName)
    .where(
      and(
        eq(workflowRunName.projectId, input.projectId),
        eq(workflowRunName.workflowRunId, input.workflowRunId),
      ),
    )
    .limit(1);

  const traces = await listTracesByWorkflowRun(ch, input);
  return {
    workflowRunId: input.workflowRunId,
    displayName: nameRows[0]?.name ?? null,
    traces: traces.map((r) => ({
      traceId: r.trace_id,
      agentName: r.agent_name || null,
      workflowName: r.workflow_name || null,
      startTime: r.trace_start,
      endTime: r.trace_end,
      durationMs: num(r.duration_ms),
      spanCount: num(r.span_count),
      errorCount: num(r.error_count),
      totalCost: decimalOrNull(r.total_cost),
      totalTokens: num(r.total_tokens),
    })),
  };
}
