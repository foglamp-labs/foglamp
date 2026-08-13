import { describe, expect, test } from "bun:test";

import type { IngestPayload } from "@foglamp/contracts";
import type { ModelPrice, PricingTable } from "@foglamp/cost";

import { buildCustomerRows, buildSpanRows } from "./transform";

type Trace = IngestPayload["traces"][number];
type IngestSpan = Trace["spans"][number];

// buildCustomerRows ignores spans entirely (it only reads trace.customer), but
// the payload type requires at least one — a minimal llm span keeps it typed.
const span = {
  spanId: "s1",
  spanType: "llm",
  name: "step",
  startTime: 0,
  endTime: 1,
  status: "ok",
} as Trace["spans"][number];

function payload(traces: Array<Omit<Trace, "spans">>): IngestPayload {
  return {
    version: "v1",
    traces: traces.map((t) => ({ ...t, spans: [span] })) as Trace[],
  };
}

describe("buildCustomerRows", () => {
  test("maps a trace's customer to a dimension row", () => {
    const rows = buildCustomerRows({
      payload: payload([
        {
          traceId: "t1",
          agentName: "a",
          customer: { id: "c1", name: "Acme", imageUrl: "https://x/a.png" },
        },
      ]),
      projectId: "p1",
      now: 1234,
    });
    expect(rows).toEqual([
      {
        project_id: "p1",
        customer_id: "c1",
        customer_name: "Acme",
        customer_image_url: "https://x/a.png",
        last_seen: 1234,
      },
    ]);
  });

  test("dedupes by customer_id — the latest occurrence in the batch wins", () => {
    const rows = buildCustomerRows({
      payload: payload([
        { traceId: "t1", agentName: "a", customer: { id: "c1", name: "Old" } },
        { traceId: "t2", agentName: "a", customer: { id: "c1", name: "New" } },
      ]),
      projectId: "p1",
      now: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.customer_name).toBe("New");
  });

  test("traces without a customer produce no rows", () => {
    const rows = buildCustomerRows({
      payload: payload([{ traceId: "t1", agentName: "a" }]),
      projectId: "p1",
      now: 1,
    });
    expect(rows).toEqual([]);
  });

  test("absent name/imageUrl default to empty strings", () => {
    const rows = buildCustomerRows({
      payload: payload([
        { traceId: "t1", agentName: "a", customer: { id: "c1" } },
      ]),
      projectId: "p1",
      now: 7,
    });
    expect(rows[0]).toEqual({
      project_id: "p1",
      customer_id: "c1",
      customer_name: "",
      customer_image_url: "",
      last_seen: 7,
    });
  });
});

// ---------- buildSpanRows ----------------------------------------------------

const GPT4O_PRICE: ModelPrice = {
  prompt: "0.000005",
  completion: "0.00001",
  request: null,
  image: null,
  webSearch: null,
  internalReasoning: null,
  cacheRead: null,
  cacheWrite: null,
};

const TABLE: PricingTable = new Map([["openai/gpt-4o", GPT4O_PRICE]]);

function makeSpan(overrides: Partial<IngestSpan>): IngestSpan {
  return {
    spanId: "s1",
    spanType: "llm",
    name: "step 0",
    startTime: 1_000,
    endTime: 2_000,
    status: "ok",
    ...overrides,
  } as IngestSpan;
}

function spanRows(traces: Trace[], overrides?: Partial<Parameters<typeof buildSpanRows>[0]>) {
  return buildSpanRows({
    payload: { version: "v1", traces } as IngestPayload,
    projectId: "p1",
    orgId: "o1",
    retentionDays: 30,
    table: TABLE,
    rules: [],
    now: 5_000,
    ...overrides,
  });
}

describe("buildSpanRows", () => {
  test("denormalizes trace fields onto every row and passes span timing through", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        traceName: "checkout",
        agentName: "shopper",
        workflowName: "wf",
        workflowRunId: "run-1",
        sessionId: "sess-1",
        customer: { id: "cust-1" },
        spans: [
          makeSpan({ spanId: "root", spanType: "agent", name: "shopper" }),
          makeSpan({
            spanId: "s1",
            parentSpanId: "root",
            startTime: 1_100,
            endTime: 1_600,
          }),
        ],
      } as Trace,
    ]);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.project_id).toBe("p1");
      expect(row.org_id).toBe("o1");
      expect(row.retention_days).toBe(30);
      expect(row.trace_id).toBe("t1");
      expect(row.trace_name).toBe("checkout");
      expect(row.agent_name).toBe("shopper");
      expect(row.workflow_name).toBe("wf");
      expect(row.workflow_run_id).toBe("run-1");
      expect(row.session_id).toBe("sess-1");
      expect(row.customer_id).toBe("cust-1");
    }
    const [root, step] = rows;
    // parentSpanId absent → empty string, never null.
    expect(root!.parent_span_id).toBe("");
    expect(step!.parent_span_id).toBe("root");
    expect(step!.start_time).toBe(1_100);
    expect(step!.end_time).toBe(1_600);
    expect(step!.duration_ms).toBe(500);
  });

  test("an inverted span window clamps duration to 0 instead of going negative", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [makeSpan({ startTime: 2_000, endTime: 1_500 })],
      } as Trace,
    ]);
    expect(rows[0]!.duration_ms).toBe(0);
  });

  test("span metadata merges over trace metadata, span winning on conflicts", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        metadata: { env: "prod", region: "us" },
        spans: [makeSpan({ metadata: { region: "eu", step: "0" } })],
      } as Trace,
    ]);
    expect(rows[0]!.metadata).toEqual({ env: "prod", region: "eu", step: "0" });
  });

  test("llm span with a known model gets priced: costs, resolved id, source, priced_at", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [
          makeSpan({
            provider: "openai",
            modelId: "gpt-4o",
            usage: { inputTokens: 1_000, outputTokens: 500, totalTokens: 1_500 },
          }),
        ],
      } as Trace,
    ]);
    const row = rows[0]!;
    expect(row.priced_model_id).toBe("openai/gpt-4o");
    expect(row.pricing_source).toBe("openrouter");
    expect(row.priced_at).toBe(5_000);
    // 1000 × 0.000005 + 500 × 0.00001 = 0.005 + 0.005 = 0.01
    expect(Number(row.prompt_cost)).toBeCloseTo(0.005, 10);
    expect(Number(row.completion_cost)).toBeCloseTo(0.005, 10);
    expect(Number(row.total_cost)).toBeCloseTo(0.01, 10);
    // A priced span defaults to one request even when usage doesn't say so.
    expect(row.request_count).toBe(1);
    expect(row.input_tokens).toBe(1_000);
    expect(row.output_tokens).toBe(500);
    expect(row.total_tokens).toBe(1_500);
  });

  test("agent and tool spans are never priced, even when they carry a model id", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [
          makeSpan({ spanId: "root", spanType: "agent", provider: "openai", modelId: "gpt-4o" }),
          makeSpan({ spanId: "tool1", spanType: "tool", provider: "openai", modelId: "gpt-4o" }),
        ],
      } as Trace,
    ]);
    for (const row of rows) {
      expect(row.total_cost).toBeNull();
      expect(row.pricing_source).toBe("");
      expect(row.priced_model_id).toBe("");
      expect(row.priced_at).toBeNull();
      expect(row.request_count).toBe(0);
    }
  });

  test("unknown model → all-null costs and no priced_at, but still one request", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [
          makeSpan({
            provider: "mystery",
            modelId: "unknown-9000",
            usage: { inputTokens: 10, outputTokens: 10 },
          }),
        ],
      } as Trace,
    ]);
    const row = rows[0]!;
    expect(row.total_cost).toBeNull();
    expect(row.prompt_cost).toBeNull();
    expect(row.pricing_source).toBe("");
    expect(row.priced_model_id).toBe("");
    expect(row.priced_at).toBeNull();
    expect(row.request_count).toBe(1);
  });

  test("a custom pricing rule overrides the table and stamps its source", () => {
    const rows = spanRows(
      [
        {
          traceId: "t1",
          spans: [
            makeSpan({
              provider: "openai",
              modelId: "gpt-4o",
              usage: { inputTokens: 1_000, outputTokens: 0 },
            }),
          ],
        } as Trace,
      ],
      { rules: [{ pattern: "openai/gpt-4o", price: { prompt: "0.00001" } }] },
    );
    const row = rows[0]!;
    // Base price exists and the override touches part of it → "mixed".
    expect(row.pricing_source).toBe("mixed");
    expect(Number(row.prompt_cost)).toBeCloseTo(0.01, 10);
  });

  test("timing annotations round to integers; jitter avg stays fractional", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [
          makeSpan({
            ttftMs: 12.6,
            reasoningDurationMs: 3.2,
            modelCallMs: 480.4,
            responseTimeMs: 480.5,
            chunkJitter: { min: 1.4, p10: 2.5, median: 3.6, avg: 4.25, p90: 5.5, max: 9.9 },
          }),
        ],
      } as Trace,
    ]);
    const row = rows[0]!;
    expect(row.ttft_ms).toBe(13);
    expect(row.reasoning_duration_ms).toBe(3);
    expect(row.model_call_ms).toBe(480);
    expect(row.response_time_ms).toBe(481);
    expect(row.chunk_jitter_min).toBe(1);
    expect(row.chunk_jitter_p10).toBe(3);
    expect(row.chunk_jitter_median).toBe(4);
    expect(row.chunk_jitter_avg).toBe(4.25);
    expect(row.chunk_jitter_p90).toBe(6);
    expect(row.chunk_jitter_max).toBe(10);
  });

  test("absent optional fields land as empty strings / zeros / nulls, never undefined", () => {
    const rows = spanRows([{ traceId: "t1", spans: [makeSpan({})] } as Trace]);
    const row = rows[0]!;
    expect(row.error_message).toBe("");
    expect(row.provider).toBe("");
    expect(row.model_id).toBe("");
    expect(row.input).toBe("");
    expect(row.output).toBe("");
    expect(row.tool_catalog).toBe("");
    expect(row.session_id).toBe("");
    expect(row.customer_id).toBe("");
    expect(row.input_tokens).toBe(0);
    expect(row.total_tokens).toBe(0);
    expect(row.ttft_ms).toBeNull();
    expect(row.model_call_ms).toBeNull();
    expect(row.response_time_ms).toBeNull();
    expect(row.chunk_jitter_avg).toBeNull();
    expect(row.rate_limit_tokens_remaining).toBeNull();
    // No value in the row may be undefined — ClickHouse JSONEachRow would drop it.
    for (const [key, value] of Object.entries(row)) {
      expect(value, key).not.toBeUndefined();
    }
  });

  test("rate-limit headroom passes through per field", () => {
    const rows = spanRows([
      {
        traceId: "t1",
        spans: [
          makeSpan({
            rateLimit: {
              requestsLimit: 100,
              requestsRemaining: 42,
              tokensLimit: 10_000,
              tokensRemaining: 900,
              tokensResetMs: 1_234,
            },
          }),
        ],
      } as Trace,
    ]);
    const row = rows[0]!;
    expect(row.rate_limit_requests_limit).toBe(100);
    expect(row.rate_limit_requests_remaining).toBe(42);
    expect(row.rate_limit_requests_reset_ms).toBeNull();
    expect(row.rate_limit_tokens_limit).toBe(10_000);
    expect(row.rate_limit_tokens_remaining).toBe(900);
    expect(row.rate_limit_tokens_reset_ms).toBe(1_234);
  });
});
