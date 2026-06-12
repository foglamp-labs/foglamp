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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconCheck,
  IconCheckFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhost,
  IconMessage2Filled,
  IconSitemap,
  IconSitemapFilled,
  IconTimeline,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CopyIcon } from "@/components/app/copy-icon";
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
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatRelative,
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

/** Page numbers to render (1-based), collapsing long runs to a single ellipsis.
 * Always keeps the first/last page and the current page ±1 in view, e.g.
 * `1 … 4 5 6 … 20`. */
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const middle: number[] = [];
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    middle.push(i);
  }
  const out: (number | "ellipsis")[] = [1];
  if (middle[0] > 2) out.push("ellipsis");
  out.push(...middle);
  if (middle[middle.length - 1] < total - 1) out.push("ellipsis");
  out.push(total);
  return out;
}

// Human label for the active sort, shown in the toolbar summary.
const SORT_LABELS: Record<TraceSortKey, string> = {
  when: "time",
  cost: "cost",
  duration: "duration",
  tokens: "tokens",
  spans: "spans",
};

// Heatmap: tint cost and duration by each trace's percentile within the whole
// (filtered) result set — not just this page. The API returns global quintile
// thresholds; a traffic-light scale runs green (cheapest/fastest 20%) → yellow →
// red (priciest/slowest 20%), so each shade holds ~1/5 of traces regardless of
// skew. Light uses 600 / dark uses 400 for contrast. Literal classes so Tailwind
// keeps them.
const HEAT_SHADES = [
  "text-green-600 dark:text-green-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-amber-600 dark:text-amber-400",
  "text-orange-600 dark:text-orange-400",
  "text-red-600 dark:text-red-400",
] as const;

// Labels for the five quintile buckets, shown in the cost/duration cell tooltip.
const PCT_RANGE = [
  "0–20th",
  "20–40th",
  "40–60th",
  "60–80th",
  "80–100th",
] as const;

/** Which quintile bucket (0..4) `value` falls in against the global `thresholds`
 * (the 20/40/60/80th percentiles). null when there's nothing to place. */
function percentileBucket(
  value: number | null | undefined,
  thresholds: number[]
) {
  if (!value || value <= 0 || thresholds.length === 0) return null;
  // Bucket = how many thresholds the value exceeds (0..thresholds.length).
  let i = 0;
  for (const t of thresholds) if (value > t) i += 1;
  return Math.min(i, HEAT_SHADES.length - 1);
}

/** Tooltip copy for a bucketed cell, e.g. "80–100th percentile by cost · priciest". */
function percentileTip(bucket: number, metric: "cost" | "duration") {
  const extreme =
    metric === "cost"
      ? bucket === 0
        ? " · cheapest"
        : bucket === 4
          ? " · priciest"
          : ""
      : bucket === 0
        ? " · fastest"
        : bucket === 4
          ? " · slowest"
          : "";
  return `${PCT_RANGE[bucket]} percentile by ${metric}${extreme}`;
}

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
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              icon={IconAffiliateFilled}
              iconClassName="text-[#c9a888] dark:text-[#8b5e34]"
              size="sm"
              label="Traces"
              value={formatCount(summary?.traceCount ?? 0)}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-rose-300 dark:text-rose-700"
              size="sm"
              label="Errored traces"
              value={
                <>
                  {formatCount(summary?.errorTraceCount ?? 0)}
                  {summary?.traceCount ? (
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      {formatPercent(
                        summary.errorTraceCount / summary.traceCount
                      )}
                    </span>
                  ) : null}
                </>
              }
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-300 dark:text-sky-700"
              size="sm"
              label="Duration p95"
              value={formatDuration(summary?.durationP95 ?? 0)}
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-300 dark:text-yellow-600"
              size="sm"
              label="Total cost"
              value={formatCost(summary?.totalCost ?? 0)}
            />
          </section>

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
                                <div className="flex items-center">
                                  <span className="truncate font-mono text-[10px] max-w-36">
                                    {t.traceId}
                                  </span>

                                  <CopyIdButton id={t.traceId} />
                                </div>
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
                          {formatRelative(t.startTime)}
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

/** A right-aligned numeric cell tinted by its percentile bucket, with a tooltip
 * naming the bucket (e.g. "60–80th percentile by cost"). Unbucketed values
 * (null cost, zero duration) render plain — muted for unpriced cost. */
function HeatCell({
  value,
  thresholds,
  metric,
  bold,
  children,
}: {
  value: number | null | undefined;
  thresholds: number[];
  metric: "cost" | "duration";
  bold?: boolean;
  children: ReactNode;
}) {
  const bucket = percentileBucket(value, thresholds);
  const className = cn(
    "text-right tabular-nums",
    bold && "font-medium",
    value == null
      ? "text-muted-foreground/40"
      : bucket != null && HEAT_SHADES[bucket]
  );
  if (bucket == null) {
    return <TableCell className={className}>{children}</TableCell>;
  }
  return (
    <TableCell className={className}>
      <Tooltip>
        <TooltipTrigger
          render={<span className="cursor-default" />}
          // The row navigates on click; let the trigger ignore clicks so a
          // mis-aimed tap on the number still opens the trace.
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{percentileTip(bucket, metric)}</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

/** Copy a trace id to the clipboard, with a brief check-mark confirmation.
 * Stops propagation so it doesn't trigger the row's navigate-on-click. */
function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy trace ID"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground/50 cursor-pointer transition-colors hover:text-foreground"
    >
      <CopyIcon
        copied={copied}
        className="size-3"
        checkClassName="size-3 text-green-600 dark:text-green-400"
      />
    </button>
  );
}
