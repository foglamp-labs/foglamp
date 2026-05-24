"use client";

import { IconRobot } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@watchtower/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchtower/ui/components/table";
import { useMemo, useState } from "react";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { resolveRange, type RangeKey } from "@/lib/range";
import { trpc } from "@/utils/trpc";

export function AgentsClient() {
  const { projectId } = useProject();
  const [range, setRange] = useState<RangeKey>("24h");
  const { from, to } = useMemo(() => resolveRange(range), [range]);

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
        description="Per-agent cost, latency, and token usage."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {agents.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconRobot}
          title="No agent activity"
          description="Set agentName on the SDK integration to break down by agent."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Latency p50 / p95</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.agentName}>
                <TableCell className="font-medium">{a.agentName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(a.spanCount)}
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatCount(a.llmSpanCount)} LLM)
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.errorCount > 0 ? (
                    <Badge variant="rose">{formatCount(a.errorCount)}</Badge>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatTokens(a.totalTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(a.latencyMs.p50)} / {formatDuration(a.latencyMs.p95)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCost(a.totalCost)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
