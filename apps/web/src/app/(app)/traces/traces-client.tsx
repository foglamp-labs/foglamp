"use client";

import { Badge } from "@foglamp/ui/components/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconAlertTriangle,
  IconGhost,
  IconMessage2Filled,
  IconSitemap,
  IconSitemapFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
  ClearFiltersButton,
  FilterSelect,
  SearchInput,
  SortableHead,
  ToggleChip,
  Toolbar,
  cycleSortParam,
  parseSortParam,
  useDebouncedValue,
  useDelayedLoading,
  useUrlFilters,
} from "@/components/app/data-table";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import { HeatCell } from "@/components/app/heat-cell";
import { pageWindow } from "@/components/app/trend-charts";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { TracesHeader } from "./header";

const PAGE_SIZE = 25;

type TraceSortKey = "when" | "cost" | "duration" | "tokens" | "spans";

const TRACE_SORT_KEYS = [
  "when",
  "cost",
  "duration",
  "tokens",
  "spans",
] as const satisfies readonly TraceSortKey[];


export function TracesClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();

  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared. The search box
  // keeps local state for typing; the debounced value syncs to ?q=.
  const [params, patchParams] = useUrlFilters({
    q: "",
    agent: "",
    workflow: "",
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
  const agentFilter = params.agent;
  const workflowFilter = params.workflow;
  const errorsOnly = params.errors === "1";
  const sort = parseSortParam(params.sort, TRACE_SORT_KEYS);
  const toggle = (key: TraceSortKey) =>
    patchParams({ sort: cycleSortParam(sort, key) });
  const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
  const setPage = (p: number) => patchParams({ page: String(p + 1) });
  const hasFilters = !!(
    debouncedSearch.trim() ||
    agentFilter ||
    workflowFilter ||
    errorsOnly
  );

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

  // Agent names for the filter dropdown.
  const agentsList = useQuery({
    ...trpc.agents.names.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId,
  });

  // Workflow names for the filter dropdown.
  const workflowsList = useQuery({
    ...trpc.workflows.names.queryOptions({
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
      workflowName: workflowFilter || undefined,
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
        <PageHeader
          title="Traces"
          icon={navItem("/traces")?.icon}
          iconClassName={navItem("/traces")?.iconClassName}
        />
        <NoProject />
      </>
    );
  }

  const rows = traces.data?.traces ?? [];
  const costQuantiles = traces.data?.costQuantiles ?? [];
  const durationQuantiles = traces.data?.durationQuantiles ?? [];
  const summary = traces.data?.summary;
  // Total pages from the filtered count (all pages), so we can render numbered
  // page links. Falls back to "at least the current page" before the count loads.
  const totalPages = Math.max(
    page + 1,
    Math.ceil((summary?.traceCount ?? 0) / PAGE_SIZE) || 1
  );
  const currentPage = page + 1;
  const pages = pageWindow(currentPage, totalPages);
  const agentOptions = (agentsList.data ?? []).map((name) => ({
    value: name,
    label: name,
    icon: (p: { className?: string }) => (
      <AgentIcon name={name} className={p.className} />
    ),
  }));
  const workflowOptions = (workflowsList.data ?? []).map((name) => ({
    value: name,
    label: name,
    icon: IconSitemapFilled,
  }));

  return (
    <>
      <TracesHeader />
      {traces.isLoading ? (
        showSkeleton ? (
          <TableSkeleton />
        ) : null
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
              onChange={(v) => patchParams({ agent: v })}
              allLabel="Any agent"
              icon={IconGhost}
              options={agentOptions}
            />
            <FilterSelect
              value={workflowFilter}
              onChange={(v) => patchParams({ workflow: v })}
              allLabel="Any workflow"
              icon={IconSitemap}
              options={workflowOptions}
            />
            <ToggleChip
              active={errorsOnly}
              onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
            >
              <IconAlertTriangle className="size-3.5" />
              Errors only
            </ToggleChip>
            <ClearFiltersButton
              show={!!(search || agentFilter || workflowFilter || errorsOnly)}
              onClick={() => {
                setSearch("");
                patchParams({ q: "", agent: "", workflow: "", errors: "" });
              }}
            />
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden whitespace-nowrap text-sm text-muted-foreground/50 tabular-nums sm:inline">
                {formatCount(summary?.traceCount ?? 0)}{" "}
                {(summary?.traceCount ?? 0) === 1 ? "trace" : "traces"}
              </span>
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
              <TooltipProvider delay={150}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trace</TableHead>
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
                          router.push(
                            `/traces/${encodeURIComponent(t.traceId)}`
                          )
                        }
                        className={cn(
                          // Left accent bar on errored traces — scannable at a glance.
                          t.errorCount > 0 &&
                            "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                        )}
                      >
                        <TableCell>
                          <div className="min-w-0 flex justify-between items-center">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium">
                                  {t.traceName ??
                                    t.agentName ??
                                    "Untitled trace"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                {t.models.length > 0 && (
                                  <span
                                    className="inline-flex min-w-0 shrink items-center gap-1"
                                    title={t.models
                                      .map(formatModelName)
                                      .join(", ")}
                                  >
                                    <ModelLogo
                                      modelId={t.models[0]}
                                      className="size-[11px] shrink-0"
                                    />
                                    <span className="truncate">
                                      {formatModelName(t.models[0])}
                                      {t.models.length > 1
                                        ? ` +${t.models.length - 1}`
                                        : ""}
                                    </span>
                                  </span>
                                )}
                                {t.sessionId && (
                                  <Link
                                    href={`/sessions/${encodeURIComponent(
                                      t.sessionId
                                    )}`}
                                    onClick={(e) => e.stopPropagation()}
                                    title="View session"
                                    className="inline-flex shrink-0 items-center gap-1 transition-colors hover:text-foreground cursor-pointer"
                                  >
                                    <IconMessage2Filled className="size-3 text-sky-500" />
                                    Session
                                  </Link>
                                )}
                                {t.agentName && (
                                  <Link
                                    href={`/agents/${encodeURIComponent(
                                      t.agentName
                                    )}`}
                                    onClick={(e) => e.stopPropagation()}
                                    title="View agent"
                                    className="inline-flex min-w-0 shrink items-center gap-1 transition-colors hover:text-foreground"
                                  >
                                    <AgentIcon
                                      name={t.agentName}
                                      filled
                                      className="size-3 shrink-0"
                                    />
                                    <span className="truncate">
                                      {t.agentName}
                                    </span>
                                  </Link>
                                )}
                                {t.workflowName && (
                                  <Link
                                    href={`/workflows/${encodeURIComponent(
                                      t.workflowName
                                    )}`}
                                    onClick={(e) => e.stopPropagation()}
                                    title="View workflow"
                                    className="inline-flex min-w-0 shrink items-center gap-1 transition-colors hover:text-foreground"
                                  >
                                    <IconSitemapFilled className="size-3 shrink-0 text-emerald-500" />
                                    <span className="truncate">
                                      {t.workflowName}
                                    </span>
                                  </Link>
                                )}
                              </div>
                            </div>
                            {t.errorCount > 0 && (
                              <Badge
                                variant="rose"
                                className="shrink-0 font-sans"
                              >
                                <IconAlertTriangle />
                                {t.errorCount}
                                {t.errorCount === 1 ? "error" : "errors"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(t.spanCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(t.totalTokens)}
                        </TableCell>
                        <HeatCell
                          value={t.durationMs}
                          thresholds={durationQuantiles}
                          metric="duration"
                        >
                          {formatDuration(t.durationMs)}
                        </HeatCell>
                        <HeatCell
                          value={t.totalCost}
                          thresholds={costQuantiles}
                          metric="cost"
                          bold
                        >
                          {formatCost(t.totalCost)}
                        </HeatCell>
                        <TableCell className="text-right text-muted-foreground">
                          <RelativeTime value={t.startTime} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>

              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground/50 tabular-nums">
                  {rows.length > 0
                    ? `Showing ${page * PAGE_SIZE + 1}–${
                        page * PAGE_SIZE + rows.length
                      } of ${formatCount(summary?.traceCount ?? 0)}`
                    : "No more traces"}
                </span>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        aria-disabled={page === 0 || traces.isFetching}
                        className={cn(
                          (page === 0 || traces.isFetching) &&
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
                              traces.isFetching && "pointer-events-none"
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
                          currentPage >= totalPages || traces.isFetching
                        }
                        className={cn(
                          (currentPage >= totalPages || traces.isFetching) &&
                            "pointer-events-none opacity-50"
                        )}
                        onClick={() => setPage(page + 1)}
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

