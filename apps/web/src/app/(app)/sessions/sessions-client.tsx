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
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconCoinFilled,
  IconGhost,
  IconMessage2Filled,
  IconStack2Filled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
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
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
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
import { RelativeTime } from "@/components/app/relative-time";
import { useCopied } from "@/components/app/use-copied";
import {
  formatCost,
  formatCount,
  formatPercent,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { SessionsHeader } from "./header";

const PAGE_SIZE = 25;

type SessionSortKey = "last" | "cost" | "tokens" | "turns";

const SESSION_SORT_KEYS = [
  "last",
  "cost",
  "tokens",
  "turns",
] as const satisfies readonly SessionSortKey[];

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
const SORT_LABELS: Record<SessionSortKey, string> = {
  last: "last activity",
  cost: "cost",
  tokens: "tokens",
  turns: "turns",
};

// Cost heatmap: tint each session's cost by its percentile within the whole
// (filtered) result set — not just this page. The API returns global quintile
// thresholds; a traffic-light scale runs green (cheapest 20%) → yellow → red
// (priciest 20%), so each shade holds ~1/5 of sessions regardless of skew. Light
// uses 600 / dark uses 400 for contrast. Literal classes so Tailwind keeps them.
const HEAT_SHADES = [
  "text-green-600 dark:text-green-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-amber-600 dark:text-amber-400",
  "text-orange-600 dark:text-orange-400",
  "text-red-600 dark:text-red-400",
] as const;

// Labels for the five quintile buckets, shown in the cost cell tooltip.
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

/** Tooltip copy for a bucketed cost cell, e.g. "80–100th percentile by cost · priciest". */
function percentileTip(bucket: number) {
  const extreme =
    bucket === 0 ? " · cheapest" : bucket === 4 ? " · priciest" : "";
  return `${PCT_RANGE[bucket]} percentile by cost${extreme}`;
}

export function SessionsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();

  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared. The search box
  // keeps local state for typing; the debounced value syncs to ?q=.
  const [params, patchParams] = useUrlFilters({
    q: "",
    agent: "",
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
  const errorsOnly = params.errors === "1";
  const sort = parseSortParam(params.sort, SESSION_SORT_KEYS);
  const toggle = (key: SessionSortKey) =>
    patchParams({ sort: cycleSortParam(sort, key) });
  const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
  const setPage = (p: number) => patchParams({ page: String(p + 1) });
  const hasFilters = !!(debouncedSearch.trim() || agentFilter || errorsOnly);

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
        <PageHeader
          title="Sessions"
          icon={navItem("/sessions")?.icon}
          iconClassName={navItem("/sessions")?.iconClassName}
        />
        <NoProject />
      </>
    );
  }

  const rows = sessions.data?.sessions ?? [];
  // Global cost quintile thresholds (from the API) drive the cost heatmap.
  const costQuantiles = sessions.data?.costQuantiles ?? [];
  const summary = sessions.data?.summary;
  // Total pages from the filtered count (all pages), so we can render numbered
  // page links. Falls back to "at least the current page" before the count loads.
  const totalPages = Math.max(
    page + 1,
    Math.ceil((summary?.sessionCount ?? 0) / PAGE_SIZE) || 1
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

  return (
    <>
      <SessionsHeader />
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
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              icon={IconMessage2Filled}
              iconClassName="text-sky-300 dark:text-sky-700"
              size="sm"
              label="Sessions"
              value={formatCount(summary?.sessionCount ?? 0)}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-rose-300 dark:text-rose-700"
              size="sm"
              label="Errored sessions"
              value={
                <>
                  {formatCount(summary?.errorSessionCount ?? 0)}
                  {summary?.sessionCount ? (
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      {formatPercent(
                        summary.errorSessionCount / summary.sessionCount
                      )}
                    </span>
                  ) : null}
                </>
              }
            />
            <StatCard
              icon={IconStack2Filled}
              iconClassName="text-fuchsia-300 dark:text-fuchsia-700"
              size="sm"
              label="Total tokens"
              value={formatTokens(summary?.totalTokens ?? 0)}
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
              placeholder="Search session id…"
            />
            <FilterSelect
              value={agentFilter}
              onChange={(v) => patchParams({ agent: v })}
              allLabel="Any agent"
              icon={IconGhost}
              options={agentOptions}
            />
            <ToggleChip
              active={errorsOnly}
              onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
            >
              <IconAlertTriangle className="size-3.5" />
              Errors only
            </ToggleChip>
            <ClearFiltersButton
              show={!!(search || agentFilter || errorsOnly)}
              onClick={() => {
                setSearch("");
                patchParams({ q: "", agent: "", errors: "" });
              }}
            />
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden whitespace-nowrap text-sm text-muted-foreground/50 tabular-nums sm:inline">
                {formatCount(summary?.sessionCount ?? 0)}{" "}
                {(summary?.sessionCount ?? 0) === 1 ? "session" : "sessions"}
              </span>
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
              <TooltipProvider delay={150}>
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
                        className={cn(
                          // Left accent bar on errored sessions — scannable at a glance.
                          s.errorCount > 0 &&
                            "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                        )}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-72">
                              {s.sessionId}
                            </span>
                            <CopyIdButton id={s.sessionId} />
                            {s.errorCount > 0 && (
                              <Badge
                                variant="rose"
                                className="font-sans ml-auto"
                              >
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
                        <HeatCell
                          value={s.totalCost}
                          thresholds={costQuantiles}
                        >
                          {formatCost(s.totalCost)}
                        </HeatCell>
                        <TableCell
                          align="right"
                          className="text-muted-foreground "
                        >
                          <RelativeTime value={s.lastSeen} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>

              <div className="flex items-center justify-between px-1">
                <p className="text-sm text-muted-foreground/50 tabular-nums">
                  {rows.length > 0
                    ? `Showing ${page * PAGE_SIZE + 1}–${
                        page * PAGE_SIZE + rows.length
                      } of ${formatCount(summary?.sessionCount ?? 0)}`
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
                              sessions.isFetching && "pointer-events-none"
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
                          currentPage >= totalPages || sessions.isFetching
                        }
                        className={cn(
                          (currentPage >= totalPages || sessions.isFetching) &&
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

/** A right-aligned cost cell tinted by its percentile bucket, with a tooltip
 * naming the bucket (e.g. "60–80th percentile by cost"). Unpriced sessions
 * render plain and muted. */
function HeatCell({
  value,
  thresholds,
  children,
}: {
  value: number | null | undefined;
  thresholds: number[];
  children: ReactNode;
}) {
  const bucket = percentileBucket(value, thresholds);
  const className = cn(
    "text-right tabular-nums font-medium",
    value == null || value <= 0
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
          // mis-aimed tap on the number still opens the session.
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{percentileTip(bucket)}</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

/** Copy a session id to the clipboard, with a brief check-mark confirmation.
 * Stops propagation so it doesn't trigger the row's navigate-on-click. */
function CopyIdButton({ id }: { id: string }) {
  const { copied, markCopied } = useCopied();
  return (
    <button
      type="button"
      title="Copy session ID"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(id);
        markCopied();
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
