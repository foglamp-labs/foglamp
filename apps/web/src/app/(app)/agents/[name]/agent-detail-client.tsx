"use client";

import {
  IconAlertTriangle,
  IconCpu,
  IconGhostFilled,
  IconPlayerPlayFilled,
  IconTool,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useDelayedLoading } from "@/components/app/data-table";
import { navItem } from "@/components/app/nav";
import { NodeFlow, type FlowNode } from "@/components/app/node-flow";
import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { useRange } from "@/components/app/range-context";
import { trpc } from "@/utils/trpc";

function stepIcon(spanType: string, modelId: string | null) {
  if (spanType === "llm")
    return <ModelLogo modelId={modelId} className="size-5" />;
  if (spanType === "tool")
    return <IconTool className="size-5 text-muted-foreground" />;
  return <IconCpu className="size-5 text-muted-foreground" />;
}

export function AgentDetailClient({ agentName }: { agentName: string }) {
  const { projectId } = useProject();
  const router = useRouter();
  const { range, setRange } = useRange();
  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );

  const detail = useQuery({
    ...trpc.agents.get.queryOptions({
      projectId: projectId!,
      agentName,
      from,
      to,
    }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(detail.isLoading);

  const back = navItem("/agents");

  if (!projectId) {
    return (
      <>
        <PageHeader title={agentName} back={back} />
        <NoProject />
      </>
    );
  }

  const data = detail.data;
  const stats = data?.stats ?? null;
  const nodes: FlowNode[] = (data?.nodes ?? []).map((n) => ({
    id: n.spanId,
    icon: stepIcon(n.spanType, n.modelId),
    label: n.name,
    sublabel: n.modelId,
    status: n.status === "error" ? "error" : "ok",
    timestamp: n.startTime,
    durationMs: n.durationMs,
  }));

  return (
    <>
      <PageHeader
        title={agentName}
        description="Agent step flow, recent traces, and windowed stats."
        back={back}
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {detail.isLoading ? (
        showSkeleton ? <TableSkeleton /> : null
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Spans"
              value={formatCount(stats?.spanCount ?? 0)}
              hint={`${formatCount(stats?.llmSpanCount ?? 0)} LLM`}
            />
            <StatCard
              label="Tokens"
              value={formatTokens(stats?.totalTokens ?? 0)}
            />
            <StatCard
              label="Latency p50 / p95"
              value={`${formatDuration(
                stats?.latencyMs.p50 ?? 0,
              )} / ${formatDuration(stats?.latencyMs.p95 ?? 0)}`}
            />
            <StatCard
              label="Cost"
              value={formatCost(stats?.totalCost ?? null)}
              hint={
                (stats?.errorCount ?? 0) > 0
                  ? `${formatCount(stats?.errorCount ?? 0)} errors`
                  : undefined
              }
            />
          </div>

          {/* Step flow of the agent's most recent trace. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Latest trace flow
                {data?.latestTraceId && (
                  <Link
                    href={`/traces/${encodeURIComponent(data.latestTraceId)}`}
                    className="font-mono text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {data.latestTraceId.slice(0, 16)}…
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No steps in the latest trace.
                </p>
              ) : (
                <NodeFlow
                  nodes={nodes}
                  onNodeClick={() => {
                    if (data?.latestTraceId)
                      router.push(
                        `/traces/${encodeURIComponent(data.latestTraceId)}`,
                      );
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Recent traces for this agent. */}
          <Card>
            <CardHeader>
              <CardTitle>Recent traces</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(data?.traces ?? []).length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={IconGhostFilled}
                    title="No traces for this agent"
                    description="It may have aged out of retention."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trace</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead className="text-right">Spans</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">When</TableHead>
                      <TableHead className="w-10" aria-label="Replay" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.traces ?? []).map((t) => (
                      <TableRow
                        key={t.traceId}
                        interactive
                        onClick={() =>
                          router.push(
                            `/traces/${encodeURIComponent(t.traceId)}`,
                          )
                        }
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {t.traceId.slice(0, 12)}…
                            {t.errorCount > 0 && (
                              <Badge variant="rose" className="font-sans">
                                <IconAlertTriangle />
                                {t.errorCount}
                                {t.errorCount === 1 ? "error" : "errors"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.workflowName ? (
                            <Badge variant="secondary">{t.workflowName}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(t.spanCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(t.totalTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(t.durationMs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCost(t.totalCost)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatRelative(t.startTime)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Replay trace"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/traces/${encodeURIComponent(t.traceId)}?replay=1`,
                              );
                            }}
                          >
                            <IconPlayerPlayFilled />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
