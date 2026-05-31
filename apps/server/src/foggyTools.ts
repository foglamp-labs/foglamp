import { tool, type ToolSet } from "ai";
import Exa from "exa-js";
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

const exa = env.EXA_API_KEY ? new Exa(env.EXA_API_KEY) : null;
const DOCS_HOST = new URL(env.FOGGY_DOCS_URL).hostname;

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
        "List recent traces (one trace = one top-level generateText/streamText call) in a window, newest first. Each row includes a `link` to open it in the dashboard.",
      inputSchema: z.object({
        ...windowInput,
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
      }),
      execute: async ({ from, to, limit }) => {
        const w = resolveWindow(from, to);
        const rows = await getTraceList(db, ch, userId, {
          projectId,
          ...w,
          limit: limit ?? 15,
        });
        return rows.map((t) => ({
          traceId: t.traceId,
          name: t.traceName ?? t.agentName ?? null,
          workflowName: t.workflowName,
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
          name: s.name,
          spanType: s.spanType,
          status: s.status,
          errorMessage: s.errorMessage,
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
        const rows = await getAgentList(db, ch, userId, { projectId, ...w });
        return rows.map((a) => ({
          ...a,
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
        const rows = await getWorkflowList(db, ch, userId, { projectId, ...w });
        return rows.map((wf) => ({
          ...wf,
          link: wf.workflowName
            ? `/workflows/${encodeURIComponent(wf.workflowName)}`
            : "/workflows/~ungrouped",
        }));
      },
    }),

    searchDocs: tool({
      description:
        "Search the Foglamp documentation for how the product works (SDK usage, the data model, concepts, self-hosting). Use for 'how do I…' questions.",
      inputSchema: z.object({ query: z.string().describe("What to look up.") }),
      execute: async ({ query }) => {
        if (!exa) {
          return {
            unavailable: true,
            note: `Docs search isn't configured. Point the user at ${env.FOGGY_DOCS_URL}.`,
          };
        }
        const res = await exa.searchAndContents(query, {
          numResults: 3,
          includeDomains: [DOCS_HOST],
          text: { maxCharacters: 1200 },
        });
        return {
          results: res.results.map((r) => ({
            title: r.title,
            url: r.url,
            text: r.text,
          })),
        };
      },
    }),
  };
}
