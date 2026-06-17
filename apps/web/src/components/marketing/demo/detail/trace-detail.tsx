"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconBoltFilled,
  IconCirclesFilled,
  IconClockFilled,
  IconCoinFilled,
  IconSparklesFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { navItem } from "@/components/app/nav";
import { StatCard } from "@/components/app/page-parts";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { type TraceSpan } from "@/lib/trace-timeline";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { TRACE_MESSAGES, TRACE_ROWS, TRACE_SPANS } from "../mock-data";

const roleLabel: Record<string, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

// The demo trace shape matches the fields TraceTimeline reads (span tree,
// timing, tokens, cost); cast through `unknown` since the real type is deep
// tRPC inference.
const spans = TRACE_SPANS as unknown as TraceSpan[];

// LLM-call count is derived from the canonical span list the timeline shows.
const llmCount = TRACE_SPANS.filter((s) => s.spanType === "llm").length;

export function TraceDetail({ traceId }: { traceId: string }) {
  const { closeDetail } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const row = TRACE_ROWS.find((t) => t.traceId === traceId) ?? TRACE_ROWS[0]!;
  const tracesNav = navItem("/traces")!;
  const errorCount = row.errors ?? 0;

  return (
    <>
      <DetailHeader
        backIcon={tracesNav.icon}
        backLabel="Traces"
        backIconClassName={tracesNav.iconClassName}
        title={row.name}
        description={traceId}
        onBack={closeDetail}
      />

      {/* Stat strip — the real trace header's six rollups. */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-violet-300 dark:text-violet-700"
          size="sm"
          label="Spans"
          value={row.spans}
        />
        <StatCard
          icon={IconSparklesFilled}
          iconClassName="text-emerald-300 dark:text-emerald-700"
          size="sm"
          label="LLM calls"
          value={String(llmCount)}
        />
        <StatCard
          icon={IconCirclesFilled}
          iconClassName="text-blue-400 dark:text-blue-600"
          size="sm"
          label="Tokens"
          value={row.tokens}
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-rose-300 dark:text-rose-700"
          size="sm"
          label="Errors"
          value={
            <span
              className={cn(
                errorCount > 0 && "text-rose-600 dark:text-rose-500",
              )}
            >
              {errorCount}
            </span>
          }
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-300 dark:text-sky-700"
          size="sm"
          label="Duration"
          value={row.duration}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-300 dark:text-yellow-600"
          size="sm"
          label="Cost"
          value={row.cost}
        />
      </section>

      {/* Waterfall + throughput replay — the real dashboard timeline component.
          Wrapped in min-w-0 like the real trace page so the fixed-width name and
          duration columns can't push the bar track past the panel's right edge. */}
      <div className="min-w-0">
        <TraceTimeline spans={spans} selected={selected} onSelect={setSelected} />
      </div>

      {/* Prompt + response payload */}
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {TRACE_MESSAGES.map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {roleLabel[m.role]}
              </span>
              <p className="text-sm text-pretty">{m.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
