"use client";

import {
  IconAlertTriangle,
  IconGhost,
  IconMessage2Filled,
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
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
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
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

const PAGE_SIZE = 25;

type SessionSortKey = "last" | "cost" | "tokens" | "turns";

// Cost heatmap: tint each session's cost by its percentile within the whole
// (filtered) result set — not just this page. The API returns global quintile
// thresholds; a traffic-light scale runs green (cheapest 20%) → yellow → red
// (priciest 20%), so each shade holds ~1/5 of sessions regardless of skew. Light
// uses 600 / dark uses 400 for contrast on either background. Literal classes so
// Tailwind keeps them.
const COST_SHADES = [
  "text-green-600 dark:text-green-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-amber-600 dark:text-amber-400",
  "text-orange-600 dark:text-orange-400",
  "text-red-600 dark:text-red-400",
] as const;

/** Traffic-light shade for `cost` bucketed against the global quintile
 * `thresholds` (green = cheap → red = pricey). undefined when nothing to scale. */
function costShade(cost: number | null | undefined, thresholds: number[]) {
  if (!cost || cost <= 0 || thresholds.length === 0) return undefined;
  // Bucket = how many thresholds the cost exceeds (0..thresholds.length).
  let i = 0;
  for (const t of thresholds) if (cost > t) i += 1;
  return COST_SHADES[Math.min(i, COST_SHADES.length - 1)];
}

export function SessionsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const [page, setPage] = useState(0);

  // Filters + sorting (applied server-side across the full result set).
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const { sort, toggle } = useTableSort<SessionSortKey>();
  const debouncedSearch = useDebouncedValue(search);
  const hasFilters = !!(debouncedSearch.trim() || agentFilter || errorsOnly);

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

  const sessions = useQuery({
    ...trpc.sessions.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      agentName: agentFilter || undefined,
      sessionId: debouncedSearch.trim() || undefined,
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(sessions.isLoading);

  if (!projectId) {
    return (
      <>
        <PageHeader title="Sessions" />
        <NoProject />
      </>
    );
  }

  const rows = sessions.data?.sessions ?? [];
  const hasMore = rows.length === PAGE_SIZE;
  // Global cost quintile thresholds (from the API) drive the cost heatmap.
  const costQuantiles = sessions.data?.costQuantiles ?? [];
  const agentOptions = (agentsList.data ?? []).map((a) => ({
    value: a.agentName,
    label: a.agentName,
    icon: IconGhost,
  }));

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Multi-turn conversations grouped by sessionId."
      />
      {sessions.isLoading ? (
        showSkeleton ? (
          <TableSkeleton />
        ) : null
      ) : rows.length === 0 && page === 0 && !hasFilters ? (
        <InstrumentEmptyState
          feature="session"
          icon={IconMessage2Filled}
          title="No sessions yet"
          description="Pass a sessionId via the SDK integration to group calls into conversations."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search session id…"
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
              icon={IconMessage2Filled}
              title="No matching sessions"
              description="Try a different search or clearing filters."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-md">Session</TableHead>
                    <TableHead className="w-72">Agent</TableHead>
                    <SortableHead
                      sortKey="turns"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-36"
                    >
                      Turns
                    </SortableHead>
                    <SortableHead
                      sortKey="tokens"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-36"
                    >
                      Tokens
                    </SortableHead>
                    <SortableHead
                      sortKey="cost"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-48"
                    >
                      Cost
                    </SortableHead>
                    <SortableHead
                      sortKey="last"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-48"
                    >
                      Last activity
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow
                      key={s.sessionId}
                      interactive
                      onClick={() =>
                        router.push(
                          `/sessions/${encodeURIComponent(s.sessionId)}`
                        )
                      }
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-72">
                            {s.sessionId}
                          </span>
                          {s.errorCount > 0 && (
                            <Badge variant="rose" className="font-sans ml-auto">
                              <IconAlertTriangle />
                              {s.errorCount}
                              {s.errorCount === 1 ? "error" : "errors"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{s.agentName ?? "—"}</TableCell>
                      <TableCell align="right">
                        {formatCount(s.turnCount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatTokens(s.totalTokens)}
                      </TableCell>
                      <TableCell
                        align="right"
                        className={cn(
                          "font-medium",
                          costShade(s.totalCost, costQuantiles)
                        )}
                      >
                        {formatCost(s.totalCost)}
                      </TableCell>
                      <TableCell
                        align="right"
                        className="text-muted-foreground "
                      >
                        {formatRelative(s.lastSeen)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between px-1">
                <p className="text-sm text-muted-foreground/50 tabular-nums">
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
            </>
          )}
        </div>
      )}
    </>
  );
}
