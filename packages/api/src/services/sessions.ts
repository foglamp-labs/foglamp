import {
  getSessionTurns,
  listSessions,
  listTraces,
  sessionCostQuantiles,
  type SessionSortField,
  type SortDir,
  type TraceListRow,
} from "@foglamp/clickhouse";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

// Max chars of raw turn input retained for the "view full input" disclosure.
const RAW_INPUT_CAP = 4_000;
// Max chars of the extracted user message shown in the conversation bubble.
const USER_MESSAGE_CAP = 2_000;

export async function getSessionList(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    from: Date;
    to: Date;
    agentName?: string;
    sessionId?: string;
    errorsOnly?: boolean;
    sort?: { field: SessionSortField; dir: SortDir };
    limit?: number;
    offset?: number;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const filters = {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    agentName: input.agentName,
    sessionId: input.sessionId,
    errorsOnly: input.errorsOnly,
  };
  // Fetch the page and, in parallel, the global cost quintile thresholds across
  // the whole filtered set — `costQuantiles` drives the cost heatmap in the UI
  // (percentile-based, so it reflects all sessions, not just the current page).
  const [sessions, quantiles] = await Promise.all([
    listSessions(ch, {
      ...filters,
      sort: input.sort,
      limit: input.limit,
      offset: input.offset,
    }),
    sessionCostQuantiles(ch, filters),
  ]);
  return {
    // 20/40/60/80th percentile cost thresholds; finite values only.
    costQuantiles: (quantiles[0]?.q ?? []).map(Number).filter(Number.isFinite),
    sessions: sessions.map((s) => ({
      sessionId: s.session_id,
      agentName: s.agent_name || null,
      turnCount: num(s.turn_count),
      spanCount: num(s.span_count),
      llmSpanCount: num(s.llm_span_count),
      errorCount: num(s.error_count),
      totalCost: decimalOrNull(s.total_cost),
      totalTokens: num(s.total_tokens),
      firstSeen: s.first_seen,
      lastSeen: s.last_seen,
    })),
  };
}

/**
 * One session's conversation: each turn is a top-level trace, merged from its
 * root-span content (`getSessionTurns`) and its rollup metrics (`listTraces`
 * filtered by session), in chronological order, plus summed session stats.
 */
export async function getSessionDetail(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; sessionId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);

  const [content, metrics] = await Promise.all([
    getSessionTurns(ch, { projectId: input.projectId, sessionId: input.sessionId }),
    listTraces(ch, {
      projectId: input.projectId,
      sessionId: input.sessionId,
      limit: 500,
    }),
  ]);

  const byTrace = new Map<string, TraceListRow>(metrics.map((m) => [m.trace_id, m]));

  const turns = content.map((c) => {
    const m = byTrace.get(c.trace_id);
    return {
      traceId: c.trace_id,
      name: c.name,
      agentName: m?.agent_name || null,
      workflowName: m?.workflow_name || null,
      startTime: c.start_time,
      endTime: c.end_time,
      durationMs: m ? num(m.duration_ms) : 0,
      status: c.status,
      userMessage: extractUserMessage(c.input),
      assistantOutput: c.output || null,
      rawInput: c.input ? c.input.slice(0, RAW_INPUT_CAP) : null,
      totalCost: decimalOrNull(m?.total_cost),
      totalTokens: m ? num(m.total_tokens) : 0,
      spanCount: m ? num(m.span_count) : 0,
      errorCount: m ? num(m.error_count) : 0,
    };
  });

  const stats = {
    turnCount: turns.length,
    totalCost: turns.reduce((acc, t) => acc + (t.totalCost ?? 0), 0),
    totalTokens: turns.reduce((acc, t) => acc + t.totalTokens, 0),
    errorCount: turns.reduce((acc, t) => acc + t.errorCount, 0),
    firstSeen: turns[0]?.startTime ?? null,
    lastSeen: turns[turns.length - 1]?.endTime ?? null,
  };

  return { sessionId: input.sessionId, agentName: turns[0]?.agentName ?? null, stats, turns };
}

/**
 * Best-effort: the root span `input` is usually a JSON messages array (each call
 * passes the running history), so surface the last user message as the turn's
 * prompt. Falls back to the raw string when it isn't a recognizable messages
 * array. Never throws.
 */
function extractUserMessage(input: string | undefined): string | null {
  if (!input) return null;
  const cap = (s: string) => (s.length > USER_MESSAGE_CAP ? `${s.slice(0, USER_MESSAGE_CAP)}…` : s);
  try {
    const parsed: unknown = JSON.parse(input);
    if (Array.isArray(parsed)) {
      for (let i = parsed.length - 1; i >= 0; i--) {
        const msg = parsed[i] as { role?: unknown; content?: unknown } | null;
        if (msg && typeof msg === "object" && msg.role === "user") {
          return cap(stringifyContent(msg.content));
        }
      }
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  return cap(input);
}

// AI SDK message content is either a string or an array of parts ({type,text,…}).
function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .filter(Boolean)
      .join("");
    if (text) return text;
  }
  return JSON.stringify(content);
}
