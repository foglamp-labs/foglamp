"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@foglamp/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconGhostFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { HEAT_SHADES, HeatCell, percentileBucket } from "@/components/app/heat-cell";
import { pageWindow } from "@/components/app/trend-charts";
import { Stat } from "@/components/app/stat";
import {
  ClearFiltersButton,
  SearchInput,
  SortableHead,
  ToggleChip,
  Toolbar,
  cycleSortParam,
  parseSortParam,
  useUrlFilters,
} from "@/components/app/data-table";
import { useDebouncedValue, useDelayedLoading } from "@/components/app/hooks";
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
import { navItem } from "@/components/app/nav";
import {
  CardsSkeleton,
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import { ViewToggle, useViewMode } from "@/components/app/view-toggle";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { AgentsHeader } from "./header";

const PAGE_SIZE = 25;

type AgentSortKey =
  | "name"
  | "spans"
  | "llm"
  | "tokens"
  | "latency"
  | "errors"
  | "cost";

const AGENT_SORT_KEYS = [
  "name",
  "spans",
  "llm",
  "tokens",
  "latency",
  "errors",
  "cost",
] as const satisfies readonly AgentSortKey[];


export function AgentsClient() {
  const { projectId } = useProject();
  const router = useRouter();
  const { range, setRange } = useRange();
  const [view, setView] = useViewMode("agents", "cards");

  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared. The search box
  // keeps local state for typing; the debounced value syncs to ?q=.
  const [params, patchParams] = useUrlFilters({
    q: "",
    errors: "",
    sort: "",
    page: "1",
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
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
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
  // Total pages from the filtered count (all pages), so we can render numbered
  // page links. Falls back to "at least the current page" before the count loads.
  const totalPages = Math.max(page + 1, Math.ceil(agentCount / PAGE_SIZE) || 1);
  const currentPage = page + 1;
  const pages = pageWindow(currentPage, totalPages);

  return (
    <>
      <AgentsHeader />
      {agents.isLoading ? (
        showSkeleton ? (
          view === "cards" ? (
            <CardsSkeleton count={6} />
          ) : (
            <TableSkeleton />
          )
        ) : null
      ) : rows.length === 0 && page === 0 && !hasFilters ? (
        <InstrumentEmptyState
          feature="agent"
          icon={IconGhostFilled}
          title="No agent activity"
          description="Set agentName on the SDK integration to break down by agent."
        />
      ) : (
        <div className="flex flex-col gap-4">
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
              <ViewToggle value={view} onChange={setView} />
              <RangePicker value={range} onChange={setRange} />
            </div>
          </Toolbar>

          {rows.length === 0 && page === 0 ? (
            <EmptyState
              icon={IconGhostFilled}
              title="No matching agents"
              description="Try a different search or clearing filters."
            />
          ) : view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((a) => {
                const bucket = percentileBucket(a.totalCost, costQuantiles);
                return (
                  <Card
                    key={a.agentName}
                    size="sm"
                    className="cursor-pointer transition-colors hover:bg-accent/40"
                    onClick={() =>
                      router.push(`/agents/${encodeURIComponent(a.agentName)}`)
                    }
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AgentIcon name={a.agentName} className="size-4" />
                        <span className="truncate">{a.agentName}</span>
                        {a.errorCount > 0 && (
                          <Badge variant="rose" className="ml-auto shrink-0">
                            <IconAlertTriangle className="size-3" />
                            {formatCount(a.errorCount)}
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
                      <Stat
                        label="Tokens"
                        value={formatTokens(a.totalTokens)}
                      />
                      <Stat
                        label="Latency p95"
                        value={formatDuration(a.latencyMs.p95)}
                      />
                      <Stat
                        label="Cost"
                        value={formatCost(a.totalCost)}
                        emphasis
                        valueClassName={
                          (bucket != null && HEAT_SHADES[bucket]) || undefined
                        }
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <TooltipProvider delay={150}>
              <Table>
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
                      className="w-28"
                    >
                      Spans
                    </SortableHead>
                    <SortableHead
                      sortKey="llm"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-28"
                    >
                      LLM
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
                      sortKey="latency"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-36"
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow
                      key={a.agentName}
                      interactive
                      onClick={() =>
                        router.push(
                          `/agents/${encodeURIComponent(a.agentName)}`
                        )
                      }
                      className={cn(
                        // Left accent bar on errored agents — scannable at a glance.
                        a.errorCount > 0 &&
                          "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                      )}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <AgentIcon name={a.agentName} className="size-4" />
                            <span className="truncate font-medium">
                              {a.agentName}
                            </span>
                          </div>
                          {a.errorCount > 0 && (
                            <Badge
                              variant="rose"
                              className="shrink-0 font-sans"
                            >
                              <IconAlertTriangle />
                              {formatCount(a.errorCount)}
                              {a.errorCount === 1 ? "error" : "errors"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatCount(a.spanCount)}
                      </TableCell>
                      <TableCell
                        align="right"
                        className="tabular-nums text-muted-foreground"
                      >
                        {formatCount(a.llmSpanCount)}
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
                        {formatCost(a.totalCost)}
                      </HeatCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}

          {rows.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground/50 tabular-nums">
                {`Showing ${page * PAGE_SIZE + 1}–${
                  page * PAGE_SIZE + rows.length
                } of ${formatCount(agentCount)}`}
              </span>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={page === 0 || agents.isFetching}
                      className={cn(
                        (page === 0 || agents.isFetching) &&
                          "pointer-events-none opacity-50"
                      )}
                      onClick={() => setPage(Math.max(0, page - 1))}
                    />
                  </PaginationItem>
                  {pages.map((p, i) =>
                    p === "ellipsis" ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: positional separator
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          className={cn(
                            agents.isFetching && "pointer-events-none"
                          )}
                          onClick={() => setPage(p - 1)}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={
                        currentPage >= totalPages || agents.isFetching
                      }
                      className={cn(
                        (currentPage >= totalPages || agents.isFetching) &&
                          "pointer-events-none opacity-50"
                      )}
                      onClick={() => setPage(page + 1)}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}
    </>
  );
}

