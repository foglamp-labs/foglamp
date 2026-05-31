"use client";

import { IconMessage2Filled } from "@tabler/icons-react";
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

import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
import {
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
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

const PAGE_SIZE = 25;

export function SessionsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [projectId, range]);

  const sessions = useQuery({
    ...trpc.sessions.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });

  if (!projectId) {
    return (
      <>
        <PageHeader title="Sessions" />
        <NoProject />
      </>
    );
  }

  const rows = sessions.data ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Multi-turn conversations grouped by sessionId. Open one for its timeline."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {sessions.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 && page === 0 ? (
        <InstrumentEmptyState
          feature="session"
          icon={IconMessage2Filled}
          title="No sessions yet"
          description="Pass a sessionId via the SDK integration to group calls into conversations."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Turns</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow
                  key={s.sessionId}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/sessions/${encodeURIComponent(s.sessionId)}`)
                  }
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{s.sessionId}</span>
                      {s.errorCount > 0 && (
                        <Badge variant="rose">{s.errorCount} err</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{s.agentName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(s.turnCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTokens(s.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCost(s.totalCost)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatRelative(s.lastSeen)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground tabular-nums">
              {rows.length > 0
                ? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length}`
                : "No more sessions"}
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={page === 0 || sessions.isFetching}
                    className={cn(
                      (page === 0 || sessions.isFetching) &&
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
                    aria-disabled={!hasMore || sessions.isFetching}
                    className={cn(
                      (!hasMore || sessions.isFetching) &&
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
