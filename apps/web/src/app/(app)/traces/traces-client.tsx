"use client";

import {
  IconAdjustmentsHorizontalFilled,
  IconLayoutDistributeHorizontalFilled,
  IconListTree,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@foglamp/ui/lib/utils";
import { Badge } from "@foglamp/ui/components/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@foglamp/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

const PAGE_SIZE = 25;

export function TracesClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const [page, setPage] = useState(0);

  // Reset to the first page when the project or range changes.
  useEffect(() => setPage(0), [projectId, range]);

  const traces = useQuery({
    ...trpc.traces.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
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
  const hasMore = rows.length === PAGE_SIZE;

  return (
    <>
      <PageHeader
        title="Traces"
        description="Each trace is one top-level generateText / streamText call."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {traces.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 && page === 0 ? (
        <EmptyState
          icon={IconLayoutDistributeHorizontalFilled}
          title="No traces yet"
          description="Run an instrumented call to see traces appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trace</TableHead>
                <TableHead>Name</TableHead>
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
                  <TableCell>{t.traceName ?? t.agentName ?? "—"}</TableCell>
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

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground tabular-nums">
              {rows.length > 0
                ? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length}`
                : "No more traces"}
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={page === 0 || traces.isFetching}
                    className={cn(
                      (page === 0 || traces.isFetching) &&
                        "pointer-events-none opacity-50"
                    )}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink isActive>{page + 1}</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={!hasMore || traces.isFetching}
                    className={cn(
                      (!hasMore || traces.isFetching) &&
                        "pointer-events-none opacity-50"
                    )}
                    onClick={() => setPage((p) => p + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </>
  );
}
