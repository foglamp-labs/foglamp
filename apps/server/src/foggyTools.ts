import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import type { Ch } from "@foglamp/api/types";
import { getAgentList } from "@foglamp/api/services/agents";
import { getModelBreakdown, getSummary } from "@foglamp/api/services/metrics";
import { getTraceDetail, getTraceList } from "@foglamp/api/services/traces";
import { getWorkflowList } from "@foglamp/api/services/workflowRuns";

// Tools are bound to one authenticated user + project. Every wrapped service
// already calls requireProjectAccess(db, userId, projectId), so the user can
// never read another project's data. Tools are read-only.
type ToolCtx = { ch: Ch; userId: string; projectId: string };

const DAY_MS = 86_400_000;

// Optional ISO from/to → concrete Dates, defaulting to the last 7 days.
const windowInput = {
  from: z
    .string()
    .optional()
    .describe("Start of the window, ISO 8601. Defaults to 7 days ago."),
  to: z
    .string()
    .optional()
    .describe("End of the window, ISO 8601. Defaults to now."),
};
function resolveWindow(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 7 * DAY_MS);
  return { from: fromDate, to: toDate };
}

// User-controlled strings (span names, error messages, trace/agent/workflow
// names arrive verbatim from customer SDK payloads) are wrapped in delimiters
// so the model treats them as opaque data rather than instructions — the
// prompt-injection mitigation paired with the rule in foggy.ts's system prompt.
function untrusted(v: string | null | undefined): string | null {
  if (v == null || v === "") return v ?? null;
  return `[BEGIN_UNTRUSTED]${v}[END_UNTRUSTED]`;
}

// Docs corpus fetcher: Mintlify auto-serves /llms.txt (index + summaries) and
// /llms-full.txt (the whole docs text). Cached in-process for 5 minutes and
// capped so a runaway docs build can't blow up the model context; on fetch
// failure a stale cache entry beats nothing.
const DOCS_CACHE_TTL_MS = 5 * 60 * 1000;
const DOCS_MAX_CHARS = 80_000;
const docsCache = new Map<string, { text: string; fetchedAt: number }>();

async function fetchDocs(full: boolean): Promise<string | null> {
  const path = full ? "/llms-full.txt" : "/llms.txt";
  const cached = docsCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < DOCS_CACHE_TTL_MS) {
    return cached.text;
  }
  try {
    const res = await fetch(new URL(path, env.FOGGY_DOCS_URL), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return cached?.text ?? null;
    const text = (await res.text()).slice(0, DOCS_MAX_CHARS);
    docsCache.set(path, { text, fetchedAt: Date.now() });
    return text;
  } catch {
    return cached?.text ?? null;
  }
}

export function buildFoggyTools({ ch, userId, projectId }: ToolCtx): ToolSet {
  return {
    getProjectSummary: tool({
      description:
        "Totals for the current project over a window — cost, tokens (in/out), request/span counts, error rate, and latency/TTFT percentiles (p50/p95/p99). Includes the previous equal-length window for comparison.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        return getSummary(db, ch, userId, { projectId, ...w });
      },
    }),

    listTraces: tool({
      description:
        "List traces (one trace = one top-level generateText/streamText call) in a window. Newest first by default; filter by agent name, trace name, or errors-only, and sort/paginate. Each row includes a `link` to open it in the dashboard.",
      inputSchema: z.object({
        ...windowInput,
        agentName: z
          .string()
          .optional()
          .describe("Only traces for this agent (exact match)."),
        traceName: z
          .string()
          .optional()
          .describe("Only traces with this name (exact match)."),
        errorsOnly: z
          .boolean()
          .optional()
          .describe("Only traces that had at least one error."),
        sort: z
          .object({
            field: z.enum(["when", "cost", "duration", "tokens", "spans"]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional()
          .describe("Sort order. Defaults to newest first."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip, for paging. Default 0."),
      }),
      execute: async ({ from, to, agentName, traceName, errorsOnly, sort, limit, offset }) => {
        const w = resolveWindow(from, to);
        const { traces } = await getTraceList(db, ch, userId, {
          projectId,
          ...w,
          agentName,
          traceName,
          errorsOnly,
          sort,
          limit: limit ?? 15,
          offset,
        });
        return traces.map((t) => ({
          traceId: t.traceId,
          name: untrusted(t.traceName ?? t.agentName ?? null),
          workflowName: untrusted(t.workflowName),
          startTime: t.startTime,
          durationMs: t.durationMs,
          spanCount: t.spanCount,
          errorCount: t.errorCount,
          totalTokens: t.totalTokens,
          totalCost: t.totalCost,
          link: `/traces/${encodeURIComponent(t.traceId)}`,
        }));
      },
    }),

    getTrace: tool({
      description:
        "Get the span breakdown for one trace by id (steps, tools, models, status, timings). Use to explain why a trace was slow, expensive, or errored.",
      inputSchema: z.object({ traceId: z.string() }),
      execute: async ({ traceId }) => {
        const detail = await getTraceDetail(db, ch, userId, { projectId, traceId });
        // Drop the large input/output payloads to keep the tool result small.
        const spans = detail.spans.slice(0, 60).map((s) => ({
          name: untrusted(s.name),
          spanType: s.spanType,
          status: s.status,
          errorMessage: untrusted(s.errorMessage),
          modelId: s.modelId,
          durationMs: s.durationMs,
          ttftMs: s.ttftMs,
          totalTokens: s.totalTokens,
          totalCost: s.totalCost,
        }));
        return { traceId, link: `/traces/${encodeURIComponent(traceId)}`, spans };
      },
    }),

    breakdownByModel: tool({
      description:
        "Per-model breakdown over a window — request count, tokens, p95 latency, and cost. Use for 'which model costs the most'.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        return getModelBreakdown(db, ch, userId, { projectId, ...w });
      },
    }),

    listAgents: tool({
      description:
        "Per-agent breakdown over a window — cost, errors, tokens, p95 latency. Each row includes a `link` to the agent's page.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        const { agents } = await getAgentList(db, ch, userId, { projectId, ...w });
        return agents.map((a) => ({
          ...a,
          // Customer-supplied name: untrusted-wrapped for the model; the link
          // keeps the raw value so the URL stays navigable.
          agentName: untrusted(a.agentName),
          link: `/agents/${encodeURIComponent(a.agentName)}`,
        }));
      },
    }),

    listWorkflows: tool({
      description:
        "Workflows active in a window, grouped by name — run count, cost, errors, last run. Each row includes a `link` to the workflow's page.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        const { workflows } = await getWorkflowList(db, ch, userId, { projectId, ...w });
        return workflows.map((wf) => ({
          ...wf,
          workflowName: untrusted(wf.workflowName),
          link: wf.workflowName
            ? `/workflows/${encodeURIComponent(wf.workflowName)}`
            : "/workflows/~ungrouped",
        }));
      },
    }),

    searchDocs: tool({
      description:
        "Fetch the Foglamp documentation for how the product works (SDK usage, the data model, concepts, self-hosting). Use for 'how do I…' questions. Returns the docs index with per-page summaries; set full=true when you need the complete docs text to answer precisely.",
      inputSchema: z.object({
        full: z
          .boolean()
          .optional()
          .describe(
            "Fetch the full documentation text instead of the index. Slower and much larger; use only when the index isn't enough.",
          ),
      }),
      execute: async ({ full }) => {
        const text = await fetchDocs(full ?? false);
        if (!text) {
          return {
            unavailable: true,
            note: `The docs site is unreachable right now. Point the user at ${env.FOGGY_DOCS_URL}.`,
          };
        }
        return { source: env.FOGGY_DOCS_URL, text };
      },
    }),
  };
}
