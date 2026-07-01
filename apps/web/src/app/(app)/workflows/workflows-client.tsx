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
  IconSitemap,
  IconSitemapFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
import { HEAT_SHADES, HeatCell, percentileBucket } from "@/components/app/heat-cell";
import { pageWindow } from "@/components/app/trend-charts";
import { Stat } from "@/components/app/stat";
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
import { RelativeTime } from "@/components/app/relative-time";
import { ViewToggle, useViewMode } from "@/components/app/view-toggle";
import { formatCost, formatCount, formatTokens } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { WorkflowsHeader } from "./header";

const PAGE_SIZE = 25;

// Sentinel path segment for the no-workflow-name ("Ungrouped") bucket, since a
// route segment can't be the empty string. The detail page maps it back to "".
export const UNGROUPED = "~ungrouped";

type WorkflowSortKey =
  | "name"
  | "runs"
  | "traces"
  | "tokens"
  | "errors"
  | "cost"
  | "lastRun";

const WORKFLOW_SORT_KEYS = [
  "name",
  "runs",
  "traces",
  "tokens",
  "errors",
  "cost",
  "lastRun",
] as const satisfies readonly WorkflowSortKey[];


export function WorkflowsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const [view, setView] = useViewMode("workflows", "cards");

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
  const sort = parseSortParam(params.sort, WORKFLOW_SORT_KEYS);
  const toggle = (key: WorkflowSortKey) =>
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

  const workflows = useQuery({
    ...trpc.workflows.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      workflowName: debouncedSearch.trim() || undefined,
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
  const showSkeleton = useDelayedLoading(workflows.isLoading);

  if (!projectId) {
    return (
      <>
        <PageHeader
          title="Workflows"
          icon={navItem("/workflows")?.icon}
          iconClassName={navItem("/workflows")?.iconClassName}
        />
        <NoProject />
      </>
    );
  }

  const rows = workflows.data?.workflows ?? [];
  const costQuantiles = workflows.data?.costQuantiles ?? [];
  const summary = workflows.data?.summary;
  const workflowCount = summary?.workflowCount ?? 0;
  // Total pages from the filtered count (all pages), so we can render numbered
  // page links. Falls back to "at least the current page" before the count loads.
  const totalPages = Math.max(
    page + 1,
    Math.ceil(workflowCount / PAGE_SIZE) || 1
  );
  const currentPage = page + 1;
  const pages = pageWindow(currentPage, totalPages);

  return (
    <>
      <WorkflowsHeader />
      {workflows.isLoading ? (
        showSkeleton ? (
          view === "cards" ? (
            <CardsSkeleton count={6} />
          ) : (
            <TableSkeleton />
          )
        ) : null
      ) : rows.length === 0 && page === 0 && !hasFilters ? (
        <InstrumentEmptyState
          feature="workflow"
          icon={IconSitemapFilled}
          title="No workflows yet"
          description="Pass a workflowName via the SDK integration to group runs."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search workflows…"
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
              icon={IconSitemapFilled}
              title="No matching workflows"
              description="Try a different search or clearing filters."
            />
          ) : view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((w) => {
                const label = w.workflowName ?? "Ungrouped";
                const bucket = percentileBucket(w.totalCost, costQuantiles);
                return (
                  <Card
                    key={workflowSlug(w.workflowName)}
                    size="sm"
                    className="cursor-pointer transition-colors hover:bg-accent/40"
                    onClick={() =>
                      router.push(`/workflows/${workflowSlug(w.workflowName)}`)
                    }
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <IconSitemap className="size-4 shrink-0 text-emerald-500" />
                        <span
                          className={cn(
                            "truncate",
                            !w.workflowName && "text-muted-foreground italic"
                          )}
                        >
                          {label}
                        </span>
                        {w.errorCount > 0 && (
                          <Badge variant="rose" className="ml-auto shrink-0">
                            <IconAlertTriangle className="size-3" />
                            {formatCount(w.errorCount)}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
                      <Stat label="Runs" value={formatCount(w.runCount)} />
                      <Stat
                        label="Last run"
                        value={<RelativeTime value={w.lastRun} />}
                      />
                      <Stat
                        label="Tokens"
                        value={formatTokens(w.totalTokens)}
                      />
                      <Stat
                        label="Cost"
                        value={formatCost(w.totalCost)}
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
                      Workflow
                    </SortableHead>
                    <SortableHead
                      sortKey="runs"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-28"
                    >
                      Runs
                    </SortableHead>
                    <SortableHead
                      sortKey="traces"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-28"
                    >
                      Traces
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
                      className="w-36"
                    >
                      Last run
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((w) => (
                    <TableRow
                      key={workflowSlug(w.workflowName)}
                      interactive
                      onClick={() =>
                        router.push(
                          `/workflows/${workflowSlug(w.workflowName)}`
                        )
                      }
                      className={cn(
                        // Left accent bar on errored workflows — scannable at a glance.
                        w.errorCount > 0 &&
                          "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                      )}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <IconSitemap className="size-4 shrink-0 text-emerald-500" />
                            <span
                              className={cn(
                                "truncate font-medium",
                                !w.workflowName &&
                                  "text-muted-foreground italic"
                              )}
                            >
                              {w.workflowName ?? "Ungrouped"}
                            </span>
                          </div>
                          {w.errorCount > 0 && (
                            <Badge
                              variant="rose"
                              className="shrink-0 font-sans"
                            >
                              <IconAlertTriangle />
                              {formatCount(w.errorCount)}
                              {w.errorCount === 1 ? "error" : "errors"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatCount(w.runCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatCount(w.traceCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatTokens(w.totalTokens)}
                      </TableCell>
                      <HeatCell
                        value={w.totalCost}
                        thresholds={costQuantiles}
                        bold
                      >
                        {formatCost(w.totalCost)}
                      </HeatCell>
                      <TableCell
                        align="right"
                        className="text-muted-foreground"
                      >
                        <RelativeTime value={w.lastRun} />
                      </TableCell>
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
                } of ${formatCount(workflowCount)}`}
              </span>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={page === 0 || workflows.isFetching}
                      className={cn(
                        (page === 0 || workflows.isFetching) &&
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
                            workflows.isFetching && "pointer-events-none"
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
                        currentPage >= totalPages || workflows.isFetching
                      }
                      className={cn(
                        (currentPage >= totalPages || workflows.isFetching) &&
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

/** Route segment for a workflow group. Named workflows use their encoded name;
 * the no-name bucket uses the UNGROUPED sentinel (a segment can't be empty). */
function workflowSlug(workflowName: string | null): string {
  return workflowName ? encodeURIComponent(workflowName) : UNGROUPED;
}

