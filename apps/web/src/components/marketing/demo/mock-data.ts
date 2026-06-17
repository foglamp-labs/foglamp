// Static, locally-typed data for the interactive landing-page demo. None of this
// touches tRPC or the live types — the demo is a faithful *visual* replica, so
// the shapes here only need to match what the demo components read. Where a real
// presentational component (e.g. TraceReplay) wants the deep tRPC `TraceSpan`,
// the demo casts `MockTraceSpan[] as unknown as TraceSpan[]` at the call site.
//
// The demo is lazy-loaded client-only (ssr:false), so module-load work that
// touches `new Date()` / `Math.*` is safe here. "when" fields stay as literal
// relative strings; real ClickHouse datetime strings are used only where a chart
// axis or a turn timestamp has to parse one.

import { agentColor } from "@/components/app/agent-icon";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";

export type DemoTab =
  | "overview"
  | "workflows"
  | "agents"
  | "sessions"
  | "traces"
  | "evals"
  | "alerts";

// ─────────────────────────────────────────────────────────────────────────────
// Overview — KPI cards, time series, model/agent tables, live feed
// ─────────────────────────────────────────────────────────────────────────────

export type KpiCard = {
  label: string;
  value: string;
  delta: { pct: number; dir: "up" | "down" | "flat" } | null;
  deltaInverted?: boolean;
  hint: string;
};

// The four canonical overview KPIs, in the real dashboard's order
// (Tokens → Total cost → Eval pass rate → Error rate). The overview tab supplies
// each card's icon + bottom chart (sparkline / pill); see OVERVIEW_PASS_RATE /
// OVERVIEW_ERROR_RATE for the pill fractions.
export const KPIS: KpiCard[] = [
  {
    label: "Tokens",
    value: "42.8M",
    delta: { pct: 0.18, dir: "up" },
    hint: "31.2M in · 11.6M out",
  },
  {
    label: "Total cost",
    value: "$842.17",
    delta: { pct: 0.124, dir: "up" },
    deltaInverted: true,
    hint: "~$25.3k/mo",
  },
  {
    label: "Eval pass rate",
    value: "94%",
    delta: { pct: 0.04, dir: "up" },
    hint: "6.1k checks",
  },
  {
    label: "Error rate",
    value: "0.8%",
    delta: { pct: 0.31, dir: "down" },
    deltaInverted: true,
    hint: "142 of 18.2k spans",
  },
];

// Pill-meter fractions for the two ratio KPIs (pass rate, error rate).
export const OVERVIEW_PASS_RATE = 0.94;
export const OVERVIEW_ERROR_RATE = 0.008;

export type CostPoint = {
  label: string;
  "gpt-4o": number;
  "claude-sonnet": number;
  "gpt-4o-mini": number;
};

// 24 hourly buckets, stacked by model. Hand-shaped to look like a real workday
// ramp (quiet overnight, busy midday) rather than random noise.
export const COST_SERIES: CostPoint[] = [
  ["00:00", 4.2, 3.1, 0.8],
  ["02:00", 3.1, 2.4, 0.6],
  ["04:00", 2.8, 2.0, 0.5],
  ["06:00", 5.6, 4.2, 1.1],
  ["08:00", 12.4, 9.8, 2.4],
  ["10:00", 21.6, 16.2, 4.1],
  ["12:00", 28.3, 22.1, 5.6],
  ["14:00", 31.2, 24.8, 6.2],
  ["16:00", 26.7, 20.4, 5.1],
  ["18:00", 18.9, 14.3, 3.6],
  ["20:00", 11.2, 8.7, 2.2],
  ["22:00", 6.8, 5.1, 1.3],
].map(([label, a, b, c]) => ({
  label: label as string,
  "gpt-4o": a as number,
  "claude-sonnet": b as number,
  "gpt-4o-mini": c as number,
}));

export type LatencyPoint = {
  label: string;
  p50: number;
  p95: number;
  p99: number;
};

export const LATENCY_SERIES: LatencyPoint[] = [
  ["00:00", 980, 2400, 3600],
  ["02:00", 920, 2200, 3400],
  ["04:00", 940, 2300, 3500],
  ["06:00", 1050, 2800, 4100],
  ["08:00", 1180, 3200, 4800],
  ["10:00", 1240, 3420, 5100],
  ["12:00", 1310, 3680, 5400],
  ["14:00", 1180, 3420, 5000],
  ["16:00", 1120, 3100, 4600],
  ["18:00", 1040, 2900, 4200],
  ["20:00", 990, 2600, 3800],
  ["22:00", 960, 2450, 3650],
].map(([label, p50, p95, p99]) => ({
  label: label as string,
  p50: p50 as number,
  p95: p95 as number,
  p99: p99 as number,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Overview — full-fidelity time series + ranked breakdowns
// ─────────────────────────────────────────────────────────────────────────────

// `n` hourly ClickHouse datetime strings ('YYYY-MM-DD HH:MM:SS', UTC) ending at
// a fixed recent hour, so makeBucketLabel/formatBucketFull parse them like the
// real timeseries buckets.
function hourBuckets(n: number): string[] {
  const base = new Date("2026-06-15T14:00:00Z").getTime();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base - (n - 1 - i) * 3_600_000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  });
}

// 24 hourly buckets shared by every overview/detail trend chart.
const OV_BUCKETS = hourBuckets(24);

// A workday bell over the hour-of-day: ~0 in the small hours, ~1 mid-afternoon.
function wave(hour: number): number {
  return 0.5 - 0.5 * Math.cos(((hour - 3) / 24) * 2 * Math.PI);
}

// Index-seeded jitter in [0,1) — deterministic (no Math.random) so renders are
// stable across reloads.
const jitter = (i: number, seed: number, mod: number) =>
  ((i * seed) % mod) / mod;

export type OverviewPoint = {
  bucket: string;
  requests: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  tokens: number;
  cost: number;
};

export const OVERVIEW_SERIES: OverviewPoint[] = OV_BUCKETS.map((bucket, i) => {
  const h = Number(bucket.slice(11, 13));
  const w = wave(h);
  const jA = jitter(i, 7919, 17);
  const jB = jitter(i, 5077, 13);
  const requests = Math.round(140 + w * 660 + jA * 120);
  const errors = Math.round(requests * (0.004 + 0.018 * (1 - w) + 0.01 * jB));
  const p50 = Math.round(880 + w * 460 + jB * 120);
  const p95 = Math.round(p50 * (2.3 + 0.4 * jA));
  const p99 = Math.round(p95 * (1.35 + 0.3 * w));
  const tokens = Math.round(requests * (2000 + jA * 600));
  const cost = +(requests * (0.008 + 0.004 * w)).toFixed(3);
  return { bucket, requests, errors, p50, p95, p99, tokens, cost };
});

// Per-model cost over time (m0 gpt-5.5 / m1 claude-opus-4.8 / m2 gemini-3.5-flash),
// derived from the overview cost so the lines and the "Models" breakdown agree.
export type OverviewCostPoint = {
  bucket: string;
  m0: number;
  m1: number;
  m2: number;
};

export const OVERVIEW_COST_SERIES: OverviewCostPoint[] = OVERVIEW_SERIES.map(
  (r, i) => {
    const jt = jitter(i, 3313, 11);
    return {
      bucket: r.bucket,
      m0: +(r.cost * (0.5 + 0.08 * jt)).toFixed(3),
      m1: +(r.cost * (0.32 + 0.05 * (1 - jt))).toFixed(3),
      m2: +(r.cost * (0.12 + 0.03 * jt)).toFixed(3),
    };
  }
);

// Vendor brand accents (OpenAI / Anthropic / Google) reused by the cost chart
// and its legend; the "Models" breakdown renders the real ModelLogo per row.
export const OVERVIEW_COST_CONFIG = {
  m0: { label: "gpt-5.5", colors: { light: ["#10a37f"], dark: ["#10a37f"] } },
  m1: {
    label: "claude-opus-4.8",
    colors: { light: ["#d97757"], dark: ["#d97757"] },
  },
  m2: {
    label: "gemini-3.5-flash",
    colors: { light: ["#1ba1e3"], dark: ["#1ba1e3"] },
  },
} satisfies ChartConfig;

export const OVERVIEW_COST_ITEMS: {
  key: string;
  label: string;
  color: string;
}[] = [
  { key: "m0", label: "gpt-5.5", color: "#10a37f" },
  { key: "m1", label: "claude-opus-4.8", color: "#d97757" },
  { key: "m2", label: "gemini-3.5-flash", color: "#1ba1e3" },
];

// Ranked Models / Agents / Workflows breakdown rows for the three overview list
// cards. `fraction` is the row cost over its category max (drives the share bar);
// `metrics` is the prebuilt secondary line.
export type OverviewBreakdownItem = {
  name: string;
  cost: number;
  fraction: number;
  metrics: string;
  color: string;
};

export const OVERVIEW_BREAKDOWN: {
  models: OverviewBreakdownItem[];
  agents: OverviewBreakdownItem[];
  workflows: OverviewBreakdownItem[];
} = {
  models: [
    {
      name: "gpt-5.5",
      cost: 512.4,
      fraction: 1,
      metrics: "8.1k req · 24.2M · p95 3.61s",
      color: "#10a37f",
    },
    {
      name: "claude-opus-4.8",
      cost: 284.1,
      fraction: 0.554,
      metrics: "5.6k req · 14.1M · p95 2.98s",
      color: "#d97757",
    },
    {
      name: "gemini-3.5-flash",
      cost: 45.67,
      fraction: 0.089,
      metrics: "4.5k req · 4.5M · p95 1.42s",
      color: "#1ba1e3",
    },
  ],
  agents: [
    {
      name: "research-planner",
      cost: 318.2,
      fraction: 1,
      metrics: "3.1k req · 12 err · p95 4.12s",
      color: agentColor("research-planner"),
    },
    {
      name: "support-triage",
      cost: 214.8,
      fraction: 0.675,
      metrics: "6.2k req · 31 err · p95 2.81s",
      color: agentColor("support-triage"),
    },
    {
      name: "code-reviewer",
      cost: 196.4,
      fraction: 0.617,
      metrics: "2.4k req · 8 err · p95 3.94s",
      color: agentColor("code-reviewer"),
    },
    {
      name: "email-drafter",
      cost: 58.1,
      fraction: 0.183,
      metrics: "1.8k req · 4 err · p95 1.62s",
      color: agentColor("email-drafter"),
    },
  ],
  workflows: [
    {
      name: "onboard-customer",
      cost: 142.3,
      fraction: 1,
      metrics: "1.2k runs · 5.9k req · 35 err",
      color: "var(--color-emerald-500)",
    },
    {
      name: "incident-summary",
      cost: 96.1,
      fraction: 0.675,
      metrics: "318 runs · 1.8k req · 22 err",
      color: "var(--color-emerald-500)",
    },
    {
      name: "weekly-digest",
      cost: 88.4,
      fraction: 0.621,
      metrics: "842 runs · 3.2k req · 6 err",
      color: "var(--color-emerald-500)",
    },
  ],
};

// The 20/40/60/80th percentile thresholds of the positive values — paired with
// `percentileBucket` (from heat-cell) to traffic-light cost cells in card grids.
export function quintiles(values: number[]): number[] {
  const xs = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map(
    (q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!
  );
}

export type ModelRow = {
  modelId: string;
  requests: string;
  tokens: string;
  p95: string;
  cost: string;
};

export const MODEL_ROWS: ModelRow[] = [
  {
    modelId: "openai/gpt-4o",
    requests: "8.1k",
    tokens: "24.2M",
    p95: "3.61s",
    cost: "$512.40",
  },
  {
    modelId: "anthropic/claude-sonnet-4.6",
    requests: "5.6k",
    tokens: "14.1M",
    p95: "2.98s",
    cost: "$284.10",
  },
  {
    modelId: "openai/gpt-4o-mini",
    requests: "4.5k",
    tokens: "4.5M",
    p95: "1.42s",
    cost: "$45.67",
  },
];

export type AgentRow = {
  agentName: string;
  requests: string;
  errors: string;
  p95: string;
  cost: string;
};

export const AGENT_ROWS: AgentRow[] = [
  {
    agentName: "support-triage",
    requests: "6.2k",
    errors: "31",
    p95: "2.81s",
    cost: "$214.80",
  },
  {
    agentName: "research-planner",
    requests: "3.1k",
    errors: "12",
    p95: "4.12s",
    cost: "$318.20",
  },
  {
    agentName: "code-reviewer",
    requests: "2.4k",
    errors: "8",
    p95: "3.94s",
    cost: "$196.40",
  },
  {
    agentName: "email-drafter",
    requests: "1.8k",
    errors: "4",
    p95: "1.62s",
    cost: "$58.10",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Traces — list rows + one fleshed-out span waterfall
// ─────────────────────────────────────────────────────────────────────────────

export type TraceRow = {
  traceId: string;
  name: string;
  model: string;
  agentName: string;
  workflowName: string | null;
  spans: string;
  tokens: string;
  duration: string;
  durationMs: number;
  cost: string;
  costValue: number;
  when: string;
  errors?: number;
};

export const TRACE_ROWS: TraceRow[] = [
  {
    traceId: "tr_9f2a4c8e1b7d3a6f5e0c",
    name: "support-triage",
    model: "gpt-5.5",
    agentName: "support-triage",
    workflowName: "onboard-customer",
    spans: "8",
    tokens: "4.2k",
    duration: "5.84s",
    durationMs: 5840,
    cost: "$0.0418",
    costValue: 0.0418,
    when: "12s ago",
  },
  {
    traceId: "tr_3b8e1d6a9c2f7b4e0a5d",
    name: "research-planner",
    model: "claude-opus-4.8",
    agentName: "research-planner",
    workflowName: null,
    spans: "14",
    tokens: "11.8k",
    duration: "9.12s",
    durationMs: 9120,
    cost: "$0.1240",
    costValue: 0.124,
    when: "48s ago",
  },
  {
    traceId: "tr_7c1f5a2b8e4d9c6a3f0b",
    name: "code-reviewer",
    model: "gpt-5.5",
    agentName: "code-reviewer",
    workflowName: "incident-summary",
    spans: "6",
    tokens: "8.1k",
    duration: "4.36s",
    durationMs: 4360,
    cost: "$0.0820",
    costValue: 0.082,
    when: "2m ago",
    errors: 1,
  },
  {
    traceId: "tr_2d9a6c3f1b8e5d4a7c0f",
    name: "email-drafter",
    model: "gemini-3.5-flash",
    agentName: "email-drafter",
    workflowName: null,
    spans: "3",
    tokens: "1.9k",
    duration: "1.58s",
    durationMs: 1580,
    cost: "$0.0094",
    costValue: 0.0094,
    when: "3m ago",
  },
  {
    traceId: "tr_5e0b8d4a2c7f1b9e6a3d",
    name: "support-triage",
    model: "gpt-5.5",
    agentName: "support-triage",
    workflowName: "onboard-customer",
    spans: "9",
    tokens: "4.8k",
    duration: "6.21s",
    durationMs: 6210,
    cost: "$0.0472",
    costValue: 0.0472,
    when: "5m ago",
  },
  {
    traceId: "tr_8a3f1c6b9d2e7a4c0b5f",
    name: "research-planner",
    model: "claude-opus-4.8",
    agentName: "research-planner",
    workflowName: null,
    spans: "12",
    tokens: "10.2k",
    duration: "8.74s",
    durationMs: 8740,
    cost: "$0.1080",
    costValue: 0.108,
    when: "6m ago",
  },
];

export type MockTraceSpan = {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: "agent" | "llm" | "tool";
  status: "ok" | "error";
  startTime: string;
  endTime: string;
  durationMs: number;
  ttftMs: number | null;
  // Output tokens drive the throughput ribbon; total tokens + cost feed the
  // per-span rows and the whole-trace rollup the timeline renders.
  outputTokens: number;
  totalTokens: number;
  totalCost: number | null;
  chunkOffsets: number[];
  chunkTokens: number[];
};

// Base timestamps as ClickHouse datetime strings ('YYYY-MM-DD HH:MM:SS', UTC).
// One support-triage run: root agent → classify (llm) → fetch order (tool) →
// search KB (tool, llm child) → draft reply (llm).
const T = (sec: number, ms = 0) => {
  const base = new Date("2026-06-07T14:30:00Z").getTime();
  const d = new Date(base + sec * 1000 + ms);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

export const TRACE_SPANS: MockTraceSpan[] = [
  {
    spanId: "s0",
    parentSpanId: null,
    name: "support-triage",
    spanType: "agent",
    status: "ok",
    startTime: T(0),
    endTime: T(5, 840),
    durationMs: 5840,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s1",
    parentSpanId: "s0",
    name: "classify-intent",
    spanType: "llm",
    status: "ok",
    startTime: T(0, 120),
    endTime: T(1, 40),
    durationMs: 920,
    ttftMs: 280,
    outputTokens: 142,
    totalTokens: 612,
    totalCost: 0.0011,
    chunkOffsets: [280, 460, 640, 820, 920],
    chunkTokens: [4, 28, 71, 118, 142],
  },
  {
    spanId: "s2",
    parentSpanId: "s0",
    name: "fetch-order",
    spanType: "tool",
    status: "ok",
    startTime: T(1, 100),
    endTime: T(1, 720),
    durationMs: 620,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s3",
    parentSpanId: "s0",
    name: "search-knowledge-base",
    spanType: "tool",
    status: "ok",
    startTime: T(1, 780),
    endTime: T(3, 240),
    durationMs: 1460,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s4",
    parentSpanId: "s3",
    name: "rerank-results",
    spanType: "llm",
    status: "ok",
    startTime: T(2, 100),
    endTime: T(3, 180),
    durationMs: 1080,
    ttftMs: 340,
    outputTokens: 264,
    totalTokens: 1486,
    totalCost: 0.0042,
    chunkOffsets: [340, 600, 860, 1080],
    chunkTokens: [6, 88, 196, 264],
  },
  {
    spanId: "s5",
    parentSpanId: "s0",
    name: "draft-reply",
    spanType: "llm",
    status: "ok",
    startTime: T(3, 320),
    endTime: T(5, 780),
    durationMs: 2460,
    ttftMs: 520,
    outputTokens: 689,
    totalTokens: 2961,
    totalCost: 0.0089,
    chunkOffsets: [520, 980, 1480, 1980, 2460],
    chunkTokens: [8, 142, 318, 512, 689],
  },
];

// The user/assistant payload shown when a trace span is selected.
export const TRACE_MESSAGES: {
  role: "system" | "user" | "assistant";
  content: string;
}[] = [
  {
    role: "system",
    content:
      "You are a support triage agent. Classify the request, look up the order, and draft a concise reply.",
  },
  {
    role: "user",
    content:
      'Hey — my order #48213 still says "processing" after 5 days. Can you check what\'s going on?',
  },
  {
    role: "assistant",
    content:
      "I looked into order #48213 — it was held by an address-verification flag and cleared this morning. It's now packed and ships today, with delivery expected Tuesday. I've added expedited shipping at no charge for the delay.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────────────────────────────────

export type AgentCard = {
  name: string;
  spanCount: string;
  llmSpanCount: string;
  totalTokens: string;
  errorRate: string;
  errorCount: string;
  p50: string;
  p95: string;
  cost: string;
  costValue: number;
  passRate: string;
  models: string[];
};

export const AGENTS: AgentCard[] = [
  {
    name: "support-triage",
    spanCount: "8.4k",
    llmSpanCount: "6.2k",
    totalTokens: "18.2M",
    errorRate: "0.5%",
    errorCount: "31",
    p50: "1.12s",
    p95: "2.81s",
    cost: "$214.80",
    costValue: 214.8,
    passRate: "96%",
    models: ["gpt-5.5", "gemini-3.5-flash"],
  },
  {
    name: "research-planner",
    spanCount: "5.1k",
    llmSpanCount: "3.1k",
    totalTokens: "14.6M",
    errorRate: "0.4%",
    errorCount: "12",
    p50: "1.84s",
    p95: "4.12s",
    cost: "$318.20",
    costValue: 318.2,
    passRate: "91%",
    models: ["claude-opus-4.8"],
  },
  {
    name: "code-reviewer",
    spanCount: "3.6k",
    llmSpanCount: "2.4k",
    totalTokens: "9.4M",
    errorRate: "0.3%",
    errorCount: "8",
    p50: "1.42s",
    p95: "3.94s",
    cost: "$196.40",
    costValue: 196.4,
    passRate: "93%",
    models: ["gpt-5.5", "claude-opus-4.8"],
  },
  {
    name: "email-drafter",
    spanCount: "2.1k",
    llmSpanCount: "1.8k",
    totalTokens: "3.8M",
    errorRate: "0.2%",
    errorCount: "4",
    p50: "0.68s",
    p95: "1.62s",
    cost: "$58.10",
    costValue: 58.1,
    passRate: "98%",
    models: ["gemini-3.5-flash"],
  },
];

// Per-agent trend buckets (spans/errors + latency band) for the agent detail.
export type AgentSeriesPoint = {
  bucket: string;
  spans: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
};

export const AGENT_SERIES: AgentSeriesPoint[] = OV_BUCKETS.map((bucket, i) => {
  const h = Number(bucket.slice(11, 13));
  const w = wave(h);
  const jA = jitter(i, 4231, 17);
  const spans = Math.round(60 + w * 340 + jA * 70);
  const errors = Math.round(spans * (0.003 + 0.02 * (1 - w) * jA));
  const p50 = Math.round(900 + w * 500 + jA * 150);
  const p95 = Math.round(p50 * (2.2 + 0.5 * jA));
  const p99 = Math.round(p95 * (1.35 + 0.3 * w));
  return { bucket, spans, errors, p50, p95, p99 };
});

// Recent traces for the agent detail table.
export type AgentTrace = {
  traceId: string;
  name: string;
  workflow: string | null;
  spans: number;
  tokens: number;
  durationMs: number;
  cost: number;
  when: string;
  errors?: number;
};

export const AGENT_TRACES: AgentTrace[] = [
  {
    traceId: "tr_9f2a4c8e",
    name: "classify + resolve",
    workflow: "onboard-customer",
    spans: 8,
    tokens: 4200,
    durationMs: 5840,
    cost: 0.0418,
    when: "12s ago",
  },
  {
    traceId: "tr_3b8e1d6a",
    name: "multi-hop lookup",
    workflow: null,
    spans: 11,
    tokens: 8100,
    durationMs: 7320,
    cost: 0.082,
    when: "1m ago",
  },
  {
    traceId: "tr_7c1f5a2b",
    name: "refund policy",
    workflow: "incident-summary",
    spans: 6,
    tokens: 5100,
    durationMs: 4360,
    cost: 0.0521,
    when: "3m ago",
    errors: 1,
  },
  {
    traceId: "tr_2d9a6c3f",
    name: "address update",
    workflow: null,
    spans: 4,
    tokens: 2100,
    durationMs: 3120,
    cost: 0.0194,
    when: "5m ago",
  },
  {
    traceId: "tr_5e0b8d4a",
    name: "order status",
    workflow: "onboard-customer",
    spans: 9,
    tokens: 4800,
    durationMs: 6210,
    cost: 0.0472,
    when: "8m ago",
  },
  {
    traceId: "tr_8a3f1c6b",
    name: "escalation",
    workflow: null,
    spans: 12,
    tokens: 10200,
    durationMs: 8740,
    cost: 0.108,
    when: "11m ago",
  },
];

// Per-agent step flow (drives NodeFlow on the agent detail view).
export const AGENT_FLOW: {
  id: string;
  label: string;
  sublabel: string | null;
  status: "ok" | "error";
  timestamp: string;
  durationMs: number;
  type: "llm" | "tool" | "agent";
}[] = [
  {
    id: "f0",
    label: "classify-intent",
    sublabel: "gemini-3.5-flash",
    status: "ok",
    timestamp: T(0, 120),
    durationMs: 920,
    type: "llm",
  },
  {
    id: "f1",
    label: "fetch-order",
    sublabel: "tool",
    status: "ok",
    timestamp: T(1, 100),
    durationMs: 620,
    type: "tool",
  },
  {
    id: "f2",
    label: "search-kb",
    sublabel: "tool",
    status: "ok",
    timestamp: T(1, 780),
    durationMs: 1460,
    type: "tool",
  },
  {
    id: "f3",
    label: "draft-reply",
    sublabel: "gpt-5.5",
    status: "ok",
    timestamp: T(3, 320),
    durationMs: 2460,
    type: "llm",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Workflows
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowRow = {
  name: string;
  runs: string;
  steps: string;
  errorRate: string;
  errors: number;
  p50: string;
  p95: string;
  cost: string;
  costValue: number;
  tokens: string;
  lastRun: string;
};

export const WORKFLOWS: WorkflowRow[] = [
  {
    name: "onboard-customer",
    runs: "1.2k",
    steps: "5",
    errorRate: "0.6%",
    errors: 35,
    p50: "6.40s",
    p95: "12.4s",
    cost: "$142.30",
    costValue: 142.3,
    tokens: "8.4M",
    lastRun: "2m ago",
  },
  {
    name: "incident-summary",
    runs: "318",
    steps: "6",
    errorRate: "1.2%",
    errors: 22,
    p50: "9.80s",
    p95: "18.2s",
    cost: "$96.10",
    costValue: 96.1,
    tokens: "3.6M",
    lastRun: "6m ago",
  },
  {
    name: "weekly-digest",
    runs: "842",
    steps: "4",
    errorRate: "0.2%",
    errors: 6,
    p50: "4.21s",
    p95: "8.91s",
    cost: "$88.40",
    costValue: 88.4,
    tokens: "5.1M",
    lastRun: "18m ago",
  },
];

// Per-workflow trend buckets (runs/errors + duration band) for the detail page.
export type WorkflowSeriesPoint = {
  bucket: string;
  runs: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
};

export const WORKFLOW_SERIES: WorkflowSeriesPoint[] = OV_BUCKETS.map(
  (bucket, i) => {
    const h = Number(bucket.slice(11, 13));
    const w = wave(h);
    const jA = jitter(i, 6151, 13);
    const runs = Math.round(8 + w * 42 + jA * 8);
    const errors = Math.round(runs * (0.01 + 0.04 * (1 - w) * jA));
    const p50 = Math.round(6200 + w * 3200 + jA * 900);
    const p95 = Math.round(p50 * (1.7 + 0.4 * jA));
    const p99 = Math.round(p95 * (1.3 + 0.25 * w));
    return { bucket, runs, errors, p50, p95, p99 };
  }
);

// Recent runs for the workflow detail table.
export type WorkflowRun = {
  runId: string;
  displayName: string | null;
  traces: number;
  durationMs: number;
  cost: number;
  when: string;
  errorCount: number;
  status: "ok" | "error";
};

export const WORKFLOW_RUNS: WorkflowRun[] = [
  {
    runId: "run_8f21ac",
    displayName: "acme-corp",
    traces: 5,
    durationMs: 11200,
    cost: 0.142,
    when: "2m ago",
    errorCount: 0,
    status: "ok",
  },
  {
    runId: "run_3b90fe",
    displayName: "globex",
    traces: 6,
    durationMs: 14800,
    cost: 0.198,
    when: "8m ago",
    errorCount: 1,
    status: "error",
  },
  {
    runId: "run_c712da",
    displayName: null,
    traces: 4,
    durationMs: 9400,
    cost: 0.094,
    when: "15m ago",
    errorCount: 0,
    status: "ok",
  },
  {
    runId: "run_5de034",
    displayName: "initech",
    traces: 5,
    durationMs: 12600,
    cost: 0.131,
    when: "23m ago",
    errorCount: 0,
    status: "ok",
  },
  {
    runId: "run_9a14bb",
    displayName: "umbrella",
    traces: 7,
    durationMs: 18200,
    cost: 0.221,
    when: "31m ago",
    errorCount: 2,
    status: "error",
  },
  {
    runId: "run_2c88ef",
    displayName: null,
    traces: 4,
    durationMs: 8800,
    cost: 0.087,
    when: "44m ago",
    errorCount: 0,
    status: "ok",
  },
];

export const WORKFLOW_FLOW: {
  id: string;
  label: string;
  sublabel: string | null;
  status: "ok" | "error";
  timestamp: string;
  durationMs: number;
}[] = [
  {
    id: "w0",
    label: "fetch-profile",
    sublabel: "tool",
    status: "ok",
    timestamp: T(0),
    durationMs: 410,
  },
  {
    id: "w1",
    label: "research-planner",
    sublabel: "agent",
    status: "ok",
    timestamp: T(0, 500),
    durationMs: 3200,
  },
  {
    id: "w2",
    label: "enrich-context",
    sublabel: "tool",
    status: "ok",
    timestamp: T(3, 800),
    durationMs: 880,
  },
  {
    id: "w3",
    label: "email-drafter",
    sublabel: "agent",
    status: "ok",
    timestamp: T(4, 800),
    durationMs: 1900,
  },
  {
    id: "w4",
    label: "send",
    sublabel: "tool",
    status: "ok",
    timestamp: T(6, 800),
    durationMs: 240,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export type SessionRow = {
  sessionId: string;
  user: string;
  agentName: string;
  turns: string;
  tokens: string;
  cost: string;
  costValue: number;
  errorCount: number;
  when: string;
};

export const SESSIONS: SessionRow[] = [
  {
    sessionId: "ses_a91f",
    user: "user_4821",
    agentName: "support-triage",
    turns: "12",
    tokens: "18.4k",
    cost: "$0.182",
    costValue: 0.182,
    errorCount: 0,
    when: "1m ago",
  },
  {
    sessionId: "ses_3c7d",
    user: "user_1903",
    agentName: "research-planner",
    turns: "7",
    tokens: "9.2k",
    cost: "$0.094",
    costValue: 0.094,
    errorCount: 1,
    when: "4m ago",
  },
  {
    sessionId: "ses_e02b",
    user: "user_7754",
    agentName: "support-triage",
    turns: "21",
    tokens: "31.6k",
    cost: "$0.318",
    costValue: 0.318,
    errorCount: 0,
    when: "9m ago",
  },
  {
    sessionId: "ses_5d8a",
    user: "user_2210",
    agentName: "email-drafter",
    turns: "4",
    tokens: "4.1k",
    cost: "$0.041",
    costValue: 0.041,
    errorCount: 0,
    when: "14m ago",
  },
];

// Per-turn detail for the session detail view. One turn = one trace; each
// carries the user prompt + assistant output (plain text — the demo skips
// markdown), plus the rollup stats the turn-block meta row renders.
export type SessionTurn = {
  traceId: string;
  startTime: string;
  status: "ok" | "error";
  userMessage: string;
  assistantOutput: string;
  workflowName: string | null;
  totalCost: number;
  totalTokens: number;
  durationMs: number;
};

export const SESSION_TURNS: SessionTurn[] = [
  {
    traceId: "tr_9f2a4c8e",
    startTime: T(0),
    status: "ok",
    userMessage:
      'Hey — my order #48213 still says "processing" after 5 days. Can you check what\'s going on?',
    assistantOutput:
      "I looked into order #48213 — it was held by an address-verification flag and cleared this morning. It's now packed and ships today, with delivery expected Tuesday.",
    workflowName: "onboard-customer",
    totalCost: 0.0142,
    totalTokens: 2840,
    durationMs: 5840,
  },
  {
    traceId: "tr_3b8e1d6a",
    startTime: T(64, 320),
    status: "ok",
    userMessage: "Can you also add expedited shipping since it was delayed?",
    assistantOutput:
      "Done — I've upgraded #48213 to expedited shipping at no charge for the delay. You'll get a new tracking number by email within the hour.",
    workflowName: null,
    totalCost: 0.0098,
    totalTokens: 1960,
    durationMs: 3120,
  },
  {
    traceId: "tr_7c1f5a2b",
    startTime: T(141, 80),
    status: "error",
    userMessage: "What's the refund policy if it arrives damaged?",
    assistantOutput: "",
    workflowName: null,
    totalCost: 0.0021,
    totalTokens: 420,
    durationMs: 1180,
  },
  {
    traceId: "tr_2d9a6c3f",
    startTime: T(212, 540),
    status: "ok",
    userMessage:
      "Never mind that error — just tell me the return window for damaged items.",
    assistantOutput:
      "Damaged items can be returned within 30 days of delivery for a full refund or replacement. I can start a claim for you the moment it arrives — just send a photo and I'll handle the rest.",
    workflowName: "onboard-customer",
    totalCost: 0.0116,
    totalTokens: 2310,
    durationMs: 4260,
  },
  {
    traceId: "tr_5e0b8d41",
    startTime: T(298, 210),
    status: "ok",
    userMessage: "Perfect, thanks for the help!",
    assistantOutput:
      "Anytime! Your order ships today and you're all set on the return window. I'll keep an eye on #48213 and ping you if anything changes.",
    workflowName: null,
    totalCost: 0.0049,
    totalTokens: 980,
    durationMs: 1640,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Evals
// ─────────────────────────────────────────────────────────────────────────────

export type EvalRow = {
  id: string;
  name: string;
  // The check-catalog preset this eval runs (matches the real preset ids), used
  // to pull the same colored icon chip the New-eval dialog shows.
  presetId: string;
  type: "code" | "llm-judge";
  scored: string;
  passRate: number;
  avgScore: number;
};

export const EVALS: EvalRow[] = [
  {
    id: "ev_toxicity",
    name: "Toxicity / safety",
    presetId: "toxicity",
    type: "llm-judge",
    scored: "2.4k",
    passRate: 0.99,
    avgScore: 0.99,
  },
  {
    id: "ev_tool",
    name: "Tool selection",
    presetId: "tool_selection",
    type: "llm-judge",
    scored: "1.2k",
    passRate: 0.92,
    avgScore: 0.88,
  },
  {
    id: "ev_faithfulness",
    name: "Faithfulness (RAG)",
    presetId: "faithfulness",
    type: "llm-judge",
    scored: "1.4k",
    passRate: 0.88,
    avgScore: 0.85,
  },
  {
    id: "ev_pii",
    name: "No PII",
    presetId: "pii",
    type: "code",
    scored: "2.1k",
    passRate: 1.0,
    avgScore: 1.0,
  },
  {
    id: "ev_helpfulness",
    name: "Helpfulness",
    presetId: "helpfulness",
    type: "llm-judge",
    scored: "1.9k",
    passRate: 0.94,
    avgScore: 0.91,
  },
];

// Score distribution for the eval detail (0–1 buckets).
export const EVAL_DISTRIBUTION: { bucket: string; count: number }[] = [
  { bucket: "0.0", count: 8 },
  { bucket: "0.2", count: 14 },
  { bucket: "0.4", count: 41 },
  { bucket: "0.6", count: 132 },
  { bucket: "0.8", count: 386 },
  { bucket: "1.0", count: 819 },
];

export const EVAL_SAMPLES: {
  traceId: string;
  score: number;
  verdict: "pass" | "fail";
  note: string;
}[] = [
  {
    traceId: "tr_9f2a4c8e",
    score: 0.97,
    verdict: "pass",
    note: "Polite, acknowledges delay, offers remedy.",
  },
  {
    traceId: "tr_3b8e1d6a",
    score: 0.91,
    verdict: "pass",
    note: "Clear and courteous; slightly terse closing.",
  },
  {
    traceId: "tr_7c1f5a2b",
    score: 0.42,
    verdict: "fail",
    note: "Curt tone; no acknowledgement of the issue.",
  },
  {
    traceId: "tr_2d9a6c3f",
    score: 0.95,
    verdict: "pass",
    note: "Warm, on-brand, well-structured.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────────────────────

export type AlertRow = {
  id: string;
  name: string;
  metric: string;
  condition: string;
  status: "firing" | "ok";
  lastValue: string;
  when: string;
};

export const ALERTS: AlertRow[] = [
  {
    id: "al_cost",
    name: "Daily Spend",
    metric: "cost",
    condition: "> $1,000 / day",
    status: "ok",
    lastValue: "$842",
    when: "checked 28s ago",
  },
  {
    id: "al_err",
    name: "Error-rate spike",
    metric: "error rate",
    condition: "> 2% over 5m",
    status: "firing",
    lastValue: "3.1%",
    when: "firing 4m",
  },
  {
    id: "al_lat",
    name: "P95 latency",
    metric: "latency",
    condition: "> 5s over 10m",
    status: "ok",
    lastValue: "3.42s",
    when: "checked 28s ago",
  },
  {
    id: "al_eval",
    name: "Groundedness drop",
    metric: "eval pass rate",
    condition: "< 85% over 1h",
    status: "ok",
    lastValue: "88%",
    when: "checked 1m ago",
  },
];
