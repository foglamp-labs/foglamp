"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import { IconAlertTriangle, IconGhostFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import {
  ClearFiltersButton,
  PaginationFooter,
  SearchInput,
  SortableHead,
  ToggleChip,
  Toolbar,
  cycleSortParam,
  parseSortParam,
  useUrlFilters,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import {
  useDebouncedValue,
  useDelayedLoading,
  useEntranceOnce,
} from "@/components/app/hooks";
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableRowsSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import {
  formatCostFixed,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { AgentsHeader } from "./header";

const PAGE_SIZES = [25, 50, 100];

type AgentSortKey =
  | "name"
  | "spans"
  | "tokens"
  | "latency"
  | "errors"
  | "cost"
  | "lastRun";

const AGENT_SORT_KEYS = [
  "name",
  "spans",
  "tokens",
  "latency",
  "errors",
  "cost",
  "lastRun",
] as const satisfies readonly AgentSortKey[];

export function AgentsClient() {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const router = useRouter();
  const { range, setRange } = useRange();
  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared. The search box
  // keeps local state for typing; the debounced value syncs to ?q=.
  const [params, patchParams] = useUrlFilters({
    q: "",
    errors: "",
    sort: "",
    page: "1",
    size: "25",
  });
  const [search, setSearch] = useState(params.q);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    patchParams({ q: debouncedSearch.trim() });
  }, [debouncedSearch, patchParams]);
  // Back/forward (or any external URL change) re-syncs the input; in-flight
  // typing wins when it already matches what the URL will settle on.
  useEffect(() => {
    setSearch((prev) => (prev.trim() === params.q ? prev : params.q));
  }, [params.q]);
  const errorsOnly = params.errors === "1";
  const sort = parseSortParam(params.sort, AGENT_SORT_KEYS);
  const toggle = (key: AgentSortKey) =>
    patchParams({ sort: cycleSortParam(sort, key) });
  const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
  const setPage = (p: number) => patchParams({ page: String(p + 1) });
  const pageSize = PAGE_SIZES.includes(Number(params.size))
    ? Number(params.size)
    : 25;
  const hasFilters = !!(debouncedSearch.trim() || errorsOnly);

  // Filter/sort changes reset the page inside patchParams; project and range
  // changes happen outside it, so reset explicitly (skipping mount, which
  // would wipe the page from a shared/reloaded URL).
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: page reset on project/range change only
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    patchParams({ page: "1" });
  }, [projectId, range]);

  const agents = useQuery({
    ...trpc.agents.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      agentName: debouncedSearch.trim() || undefined,
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  // Only the table body waits on data — the toolbar and column headers are
  // static chrome and paint immediately.
  const showSkeleton = useDelayedLoading(agents.isLoading);

  if (!projectId) {
    return (
      <>
        <PageHeader
          title="Agents"
          icon={navItem("/agents")?.icon}
          iconClassName={navItem("/agents")?.iconClassName}
        />
        <NoProject />
      </>
    );
  }

  const rows = agents.data?.agents ?? [];
  const costQuantiles = agents.data?.costQuantiles ?? [];
  const summary = agents.data?.summary;
  const agentCount = summary?.agentCount ?? 0;

  return (
    <>
      {/* Wrapped here (not inside AgentsHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <AgentsHeader />
      </div>
      {/* Toolbar and table chrome always render — even for an empty result —
			    so the range picker and filters stay reachable (an empty range needs
			    the range picker to escape). The empty states swap in for the table
			    only; the body rows wait on the query (skeleton rows below). */}
      <div
        className={cn("flex flex-col gap-4 mt-1", entrance && "page-fade-in")}
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search agents…"
          />
          <ToggleChip
            active={errorsOnly}
            onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
          >
            <IconAlertTriangle className="size-3.5" />
            Errors only
          </ToggleChip>
          <ClearFiltersButton
            show={!!(search || errorsOnly)}
            onClick={() => {
              setSearch("");
              patchParams({ q: "", errors: "" });
            }}
          />
          <div className="ml-auto flex items-center gap-3">
            <RangeControl value={range} onChange={setRange} />
          </div>
        </Toolbar>

        {!agents.isLoading && rows.length === 0 && page === 0 ? (
          <div className="mt-2 px-8">
            {hasFilters ? (
              <EmptyState
                icon={IconGhostFilled}
                title="No matching agents"
                description="Try a different search or clearing filters."
              />
            ) : (
              <InstrumentEmptyState
                feature="agent"
                icon={IconGhostFilled}
                title="No agent activity"
                description="Set agentName to break down by agent."
              />
            )}
          </div>
        ) : (
          // Single column with no gap so the pagination footer's top border
          // sits flush against the table's last row.
          <div className="flex flex-col -mt-2">
            <TooltipProvider delay={150}>
              {/* Fixed layout: column widths come from the header's w-* classes,
								    so the skeleton→data swap can't re-measure and shift columns. */}
              <Table className="table-fixed min-w-5xl" stickyHeader>
                <TableHeader>
                  <TableRow>
                    <SortableHead sortKey="name" sort={sort} onSort={toggle}>
                      Agent
                    </SortableHead>
                    <SortableHead
                      sortKey="spans"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-32"
                    >
                      Spans
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
                      sortKey="latency"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-40"
                    >
                      Latency p95
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
                      sortKey="lastRun"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-40"
                    >
                      Last run
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.isLoading ? (
                    showSkeleton ? (
                      <TableRowsSkeleton cols={SKELETON_COLS} />
                    ) : null
                  ) : (
                    rows.map((a) => (
                      <TableRow
                        key={a.agentName}
                        interactive
                        onClick={() =>
                          router.push(
                            `/agents/${encodeURIComponent(a.agentName)}`
                          )
                        }
                      >
                        <TableCell className="h-12">
                          <div className="flex min-w-0 items-center gap-2">
                            <AgentIcon name={a.agentName} className="size-4" />
                            <span className="truncate font-normal">
                              {a.agentName}
                            </span>
                            {/* Compact error count — colored text, no pill. */}
                            {a.errorCount > 0 && (
                              <span
                                title={`${a.errorCount} ${a.errorCount === 1 ? "error" : "errors"}`}
                                className="flex shrink-0 items-center gap-1 ml-1 font-sans text-sm text-red-600 dark:text-red-400"
                              >
                                <IconAlertTriangle className="size-3.5 fill-current/20" />
                                {formatCount(a.errorCount)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {formatCount(a.spanCount)}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {formatTokens(a.totalTokens)}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {formatDuration(a.latencyMs.p95)}
                        </TableCell>
                        <HeatCell
                          value={a.totalCost}
                          thresholds={costQuantiles}
                          bold
                        >
                          {formatCostFixed(a.totalCost, 4)}
                        </HeatCell>
                        <TableCell
                          align="right"
                          className="text-muted-foreground"
                        >
                          <RelativeTime value={a.lastRun} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>

            {!agents.isLoading && rows.length > 0 && (
              <PaginationFooter
                page={page}
                pageSize={pageSize}
                total={agentCount}
                shown={rows.length}
                noun={["agent", "agents"]}
                isFetching={agents.isFetching}
                onPageChange={setPage}
                onPageSizeChange={(s) => patchParams({ size: String(s) })}
                pageSizes={PAGE_SIZES}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { icon: true, w: "w-28" },
  { align: "right", w: "w-10" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-16" },
  { align: "right", w: "w-14" },
] as const;
