"use client";

import { IconArrowLeft, IconListTree } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@watchtower/ui/components/badge";
import { Button } from "@watchtower/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@watchtower/ui/components/card";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { cn } from "@/lib/utils";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

type Span = {
  spanId: string;
  parentSpanId: string | null;
  spanType: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: string;
  errorMessage: string | null;
  provider: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  ttftMs: number | null;
  totalCost: number | null;
  pricingSource: string | null;
  metadata: Record<string, string>;
  input: string | null;
  output: string | null;
};

const typeVariant: Record<string, "violet" | "blue" | "amber" | "secondary"> = {
  llm: "violet",
  tool: "blue",
  agent: "amber",
};

function toMs(value: string) {
  return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

/** Order spans depth-first by parent so the waterfall reads top-to-bottom. */
function orderSpans(spans: Span[]): { span: Span; depth: number }[] {
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];
  for (const s of spans) {
    if (s.parentSpanId && spans.some((p) => p.spanId === s.parentSpanId)) {
      const list = children.get(s.parentSpanId) ?? [];
      list.push(s);
      children.set(s.parentSpanId, list);
    } else {
      roots.push(s);
    }
  }
  const byStart = (a: Span, b: Span) => toMs(a.startTime) - toMs(b.startTime);
  const out: { span: Span; depth: number }[] = [];
  const walk = (s: Span, depth: number) => {
    out.push({ span: s, depth });
    (children.get(s.spanId) ?? []).sort(byStart).forEach((c) => walk(c, depth + 1));
  };
  roots.sort(byStart).forEach((r) => walk(r, 0));
  return out;
}

export function TraceDetailClient({ traceId }: { traceId: string }) {
  const { projectId } = useProject();
  const [selected, setSelected] = useState<string | null>(null);

  const detail = useQuery({
    ...trpc.traces.get.queryOptions({ projectId: projectId!, traceId }),
    enabled: !!projectId,
  });

  const spans = (detail.data?.spans ?? []) as Span[];
  const ordered = useMemo(() => orderSpans(spans), [spans]);
  const window = useMemo(() => {
    if (spans.length === 0) return { start: 0, span: 1 };
    const start = Math.min(...spans.map((s) => toMs(s.startTime)));
    const end = Math.max(...spans.map((s) => toMs(s.endTime)));
    return { start, span: Math.max(end - start, 1) };
  }, [spans]);

  const active = spans.find((s) => s.spanId === selected) ?? null;

  const back = (
    <Button variant="outline" size="sm" render={<Link href="/traces" />}>
      <IconArrowLeft />
      Traces
    </Button>
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Trace" actions={back} />
        <NoProject />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Trace"
        description={traceId}
        actions={back}
      />

      {detail.isLoading ? (
        <TableSkeleton />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={IconListTree}
          title="Trace not found"
          description="It may have aged out of retention or never arrived."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Waterfall</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {ordered.map(({ span, depth }) => {
              const offset =
                ((toMs(span.startTime) - window.start) / window.span) * 100;
              const width = Math.max((span.durationMs / window.span) * 100, 1.5);
              return (
                <button
                  key={span.spanId}
                  type="button"
                  onClick={() =>
                    setSelected(span.spanId === selected ? null : span.spanId)
                  }
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_2fr] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    span.spanId === selected && "bg-accent",
                  )}
                >
                  <div
                    className="flex items-center gap-2 truncate"
                    style={{ paddingLeft: depth * 14 }}
                  >
                    <Badge variant={typeVariant[span.spanType] ?? "secondary"}>
                      {span.spanType}
                    </Badge>
                    <span className="truncate">{span.name}</span>
                    {span.status === "error" && (
                      <Badge variant="rose">error</Badge>
                    )}
                  </div>
                  <div className="relative h-5">
                    <div
                      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/70"
                      style={{ left: `${offset}%`, width: `${width}%` }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 pl-1 text-xs text-muted-foreground tabular-nums"
                      style={{ left: `${Math.min(offset + width, 88)}%` }}
                    >
                      {formatDuration(span.durationMs)}
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {active && <SpanDetail span={active} />}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function SpanDetail({ span }: { span: Span }) {
  const metaEntries = Object.entries(span.metadata ?? {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant={typeVariant[span.spanType] ?? "secondary"}>
            {span.spanType}
          </Badge>
          {span.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Started" value={formatDateTime(span.startTime)} />
          <Field label="Duration" value={formatDuration(span.durationMs)} />
          <Field
            label="TTFT"
            value={span.ttftMs === null ? "—" : formatDuration(span.ttftMs)}
          />
          <Field label="Model" value={span.modelId ?? "—"} />
          <Field label="Provider" value={span.provider ?? "—"} />
          <Field
            label="Tokens"
            value={`${formatTokens(span.inputTokens)} in · ${formatTokens(
              span.outputTokens,
            )} out`}
          />
          <Field label="Cost" value={formatCost(span.totalCost)} />
          <Field label="Pricing" value={span.pricingSource ?? "—"} />
        </div>

        {span.errorMessage && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {span.errorMessage}
          </div>
        )}

        {metaEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metaEntries.map(([k, v]) => (
              <Badge key={k} variant="secondary">
                {k}: {v}
              </Badge>
            ))}
          </div>
        )}

        {span.input && (
          <Payload label="Input" value={span.input} />
        )}
        {span.output && (
          <Payload label="Output" value={span.output} />
        )}
      </CardContent>
    </Card>
  );
}

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function Payload({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
        {pretty(value)}
      </pre>
    </div>
  );
}
