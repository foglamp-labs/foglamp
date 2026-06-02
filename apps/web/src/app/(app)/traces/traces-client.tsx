"use client";

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
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconAlertTriangle,
  IconGhost,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClearFiltersButton,
  FilterSelect,
  SearchInput,
  SortableHead,
  ToggleChip,
  Toolbar,
  useDebouncedValue,
  useDelayedLoading,
  useTableSort,
} from "@/components/app/data-table";
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

type TraceSortKey = "when" | "cost" | "duration" | "tokens" | "spans";

export function TracesClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const [page, setPage] = useState(0);

  // Filters + sorting (applied server-side across the full result set).
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const { sort, toggle } = useTableSort<TraceSortKey>();
  const debouncedSearch = useDebouncedValue(search);
  const hasFilters = !!(debouncedSearch.trim() || agentFilter || errorsOnly);

  // Reset to the first page when the project, range, filters, or sort change.
  useEffect(
    () => setPage(0),
    [projectId, range, debouncedSearch, agentFilter, errorsOnly, sort]
  );

  // Agent names for the filter dropdown.
  const agentsList = useQuery({
    ...trpc.agents.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId,
  });

  const traces = useQuery({
    ...trpc.traces.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      agentName: agentFilter || undefined,
      traceName: debouncedSearch.trim() || undefined,
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(traces.isLoading);

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
  const agentOptions = (agentsList.data ?? []).map((a) => ({
    value: a.agentName,
    label: a.agentName,
    icon: IconGhost,
  }));

  return (
    <>
      <PageHeader
        title="Traces"
        description="Each trace is one top-level generateText / streamText call."
      />
      {traces.isLoading ? (
        showSkeleton ? <TableSkeleton /> : null
      ) : rows.length === 0 && page === 0 && !hasFilters ? (
        <EmptyState
          icon={IconAffiliateFilled}
          title="No traces yet"
          description="Run an instrumented call to see traces appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search trace name…"
            />
            <FilterSelect
              value={agentFilter}
              onChange={setAgentFilter}
              allLabel="Any agent"
              icon={IconGhost}
              options={agentOptions}
            />
            <ToggleChip
              active={errorsOnly}
              onClick={() => setErrorsOnly((v) => !v)}
            >
              <IconAlertTriangle className="size-3.5" />
              Errors only
            </ToggleChip>
            <ClearFiltersButton
              show={!!(search || agentFilter || errorsOnly)}
              onClick={() => {
                setSearch("");
                setAgentFilter("");
                setErrorsOnly(false);
              }}
            />
            <div className="ml-auto">
              <RangePicker value={range} onChange={setRange} />
            </div>
          </Toolbar>

          {rows.length === 0 && page === 0 ? (
            <EmptyState
              icon={IconAffiliateFilled}
              title="No matching traces"
              description="Try a different search or clearing filters."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-fit">Trace</TableHead>
                    <TableHead>Name</TableHead>
                    <SortableHead
                      sortKey="spans"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-28"
                    >
                      Spans
                    </SortableHead>
                    <SortableHead
                      sortKey="tokens"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-28"
                    >
                      Tokens
                    </SortableHead>
                    <SortableHead
                      sortKey="duration"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-32"
                    >
                      Duration
                    </SortableHead>
                    <SortableHead
                      sortKey="cost"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-36"
                    >
                      Cost
                    </SortableHead>
                    <SortableHead
                      sortKey="when"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-32"
                    >
                      When
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow
                      key={t.traceId}
                      interactive
                      onClick={() =>
                        router.push(`/traces/${encodeURIComponent(t.traceId)}`)
                      }
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground w-fit">
                        <div className="flex items-center gap-0">
                          {t.traceId.slice(0, 48)}
                          {t.errorCount > 0 && (
                            <Badge variant="rose" className="ml-auto font-sans">
                              <IconAlertTriangle />
                              {t.errorCount}
                              {t.errorCount === 1 ? "error" : "errors"}
                            </Badge>
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

              <div className="flex items-center justify-between px-1">
                <p className="text-sm text-muted-foreground/50 tabular-nums">
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
            </>
          )}
        </div>
      )}
    </>
  );
}
