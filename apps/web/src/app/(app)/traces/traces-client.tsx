"use client";

import { IconListTree } from "@tabler/icons-react";
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
import { useRouter } from "next/navigation";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

export function TracesClient() {
  const { projectId } = useProject();
  const router = useRouter();
  const traces = useQuery({
    ...trpc.traces.list.queryOptions({ projectId: projectId!, limit: 100 }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return (
      <>
        <PageHeader title="Traces" />
        <NoProject />
      </>
    );
  }

  const rows = traces.data ?? [];

  return (
    <>
      <PageHeader
        title="Traces"
        description="Each trace is one top-level generateText / streamText call."
      />
      {traces.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconListTree}
          title="No traces yet"
          description="Run an instrumented call to see traces appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trace</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow
                key={t.traceId}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/traces/${encodeURIComponent(t.traceId)}`)
                }
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {t.traceId.slice(0, 12)}…
                    {t.errorCount > 0 && (
                      <Badge variant="rose">{t.errorCount} err</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{t.agentName ?? "—"}</TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
