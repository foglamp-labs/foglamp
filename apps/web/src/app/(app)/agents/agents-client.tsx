"use client";

import { IconGhostFilled, IconRobot } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  CardsSkeleton,
  EmptyState,
  NoProject,
  PageHeader,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { useRange } from "@/components/app/range-context";
import { trpc } from "@/utils/trpc";

export function AgentsClient() {
  const { projectId } = useProject();
  const router = useRouter();
  const { range, setRange } = useRange();
  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range]
  );

  const agents = useQuery({
    ...trpc.agents.list.queryOptions({ projectId: projectId!, from, to }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return (
      <>
        <PageHeader title="Agents" />
        <NoProject />
      </>
    );
  }

  const rows = agents.data ?? [];

  return (
    <>
      <PageHeader
        title="Agents"
        description="Per-agent cost, latency, and token usage. Open one for its step flow."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {agents.isLoading ? (
        <CardsSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconGhostFilled}
          title="No agent activity"
          description="Set agentName on the SDK integration to break down by agent."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <Card
              key={a.agentName}
              className="cursor-pointer transition-colors hover:bg-accent/40"
              onClick={() =>
                router.push(`/agents/${encodeURIComponent(a.agentName)}`)
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconRobot className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.agentName}</span>
                  {a.errorCount > 0 && (
                    <Badge variant="rose" className="ml-auto shrink-0">
                      {formatCount(a.errorCount)} err
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
                <Stat
                  label="Spans"
                  value={`${formatCount(a.spanCount)} · ${formatCount(
                    a.llmSpanCount
                  )} LLM`}
                />
                <Stat label="Tokens" value={formatTokens(a.totalTokens)} />
                <Stat
                  label="Latency p95"
                  value={formatDuration(a.latencyMs.p95)}
                />
                <Stat label="Cost" value={formatCost(a.totalCost)} emphasis />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${emphasis ? "font-medium" : ""}`}>
        {value}
      </span>
    </div>
  );
}
