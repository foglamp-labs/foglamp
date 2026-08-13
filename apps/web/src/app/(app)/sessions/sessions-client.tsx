"use client";

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
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconGhost,
  IconMessage2Filled,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import {
  ClearFiltersButton,
  FilterSelect,
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
import { formatCost, formatCount, formatTokens } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { SessionsHeader } from "./header";

const PAGE_SIZES = [25, 50, 100];

type SessionSortKey = "last" | "cost" | "tokens" | "turns";

const SESSION_SORT_KEYS = [
  "last",
  "cost",
  "tokens",
  "turns",
] as const satisfies readonly SessionSortKey[];

export function SessionsClient() {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();

  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared. The search box
  // keeps local state for typing; the debounced value syncs to ?q=.
  const [params, patchParams] = useUrlFilters({
    q: "",
    agent: "",
    customer: "",
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
  const agentFilter = params.agent;
  const customerFilter = params.customer;
  const errorsOnly = params.errors === "1";
  const sort = parseSortParam(params.sort, SESSION_SORT_KEYS);
  const toggle = (key: SessionSortKey) =>
    patchParams({ sort: cycleSortParam(sort, key) });
  const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
  const setPage = (p: number) => patchParams({ page: String(p + 1) });
  const pageSize = PAGE_SIZES.includes(Number(params.size))
    ? Number(params.size)
    : 25;
  const hasFilters = !!(
    debouncedSearch.trim() ||
    agentFilter ||
    customerFilter ||
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

  // Customers for the filter dropdown (cost-desc rollup; ids + display names).
  const customersList = useQuery({
    ...trpc.customers.list.queryOptions({
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
      customerId: customerFilter || undefined,
      sessionId: debouncedSearch.trim() || undefined,
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  // Only the table body waits on data — the toolbar and column headers are
  // static chrome and paint immediately.
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
  const agentOptions = (agentsList.data ?? []).map((name) => ({
    value: name,
    label: name,
    icon: (p: { className?: string }) => (
      <AgentIcon name={name} className={p.className} />
    ),
  }));
  const customerOptions = (customersList.data?.customers ?? [])
    .filter((c): c is typeof c & { customerId: string } => !!c.customerId)
    .map((c) => ({
      value: c.customerId,
      label: c.customerName ?? c.customerId,
      icon: (p: { className?: string }) => (
        <CustomerAvatar
          customerId={c.customerId}
          customerName={c.customerName}
          imageUrl={c.customerImageUrl}
          className={p.className}
        />
      ),
    }));

  return (
    <>
      {/* Wrapped here (not inside SessionsHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <SessionsHeader />
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
            placeholder="Search session id…"
          />
          <FilterSelect
            value={agentFilter}
            onChange={(v) => patchParams({ agent: v })}
            allLabel="Any agent"
            icon={IconGhost}
            options={agentOptions}
          />
          <FilterSelect
            value={customerFilter}
            onChange={(v) => patchParams({ customer: v })}
            allLabel="Any customer"
            icon={IconUser}
            options={customerOptions}
          />
          <ToggleChip
            active={errorsOnly}
            onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
          >
            <IconAlertTriangle className="size-3.5" />
            Errors only
          </ToggleChip>
          <ClearFiltersButton
            show={!!(search || agentFilter || customerFilter || errorsOnly)}
            onClick={() => {
              setSearch("");
              patchParams({ q: "", agent: "", customer: "", errors: "" });
            }}
          />
          <div className="ml-auto">
            <RangeControl value={range} onChange={setRange} />
          </div>
        </Toolbar>

        {!sessions.isLoading && rows.length === 0 && page === 0 ? (
          <div className="px-8">
            {hasFilters ? (
              <EmptyState
                icon={IconMessage2Filled}
                title="No matching sessions"
                description="Try a different search or clearing filters."
              />
            ) : (
              <InstrumentEmptyState
                feature="session"
                icon={IconMessage2Filled}
                title="No sessions yet"
                description="Pass a sessionId to group calls into conversations."
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col -mt-2">
            <TooltipProvider delay={150}>
              {/* Fixed layout: column widths come from the header's w-* classes,
                    so the skeleton→data swap can't re-measure and shift columns. */}
              <Table className="table-fixed min-w-240">
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
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
                      className="w-40"
                    >
                      Cost
                    </SortableHead>
                    <SortableHead
                      sortKey="last"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-40"
                    >
                      Last activity
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.isLoading ? (
                    showSkeleton ? (
                      <TableRowsSkeleton cols={SKELETON_COLS} />
                    ) : null
                  ) : (
                    rows.map((s) => (
                      <TableRow
                        key={s.sessionId}
                        interactive
                        onClick={() =>
                          router.push(
                            `/sessions/${encodeURIComponent(s.sessionId)}`
                          )
                        }
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-[13px]">
                                {s.sessionId}
                              </span>
                              {/* Compact error count — colored text, no pill. */}
                              {s.errorCount > 0 && (
                                <span
                                  title={`${s.errorCount} ${s.errorCount === 1 ? "error" : "errors"}`}
                                  className="flex shrink-0 items-center gap-1 font-sans text-sm text-red-600 dark:text-red-400"
                                >
                                  <IconAlertTriangle className="size-3.5 fill-current/20" />
                                  {s.errorCount}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                              {s.agentName && (
                                <Link
                                  href={`/agents/${encodeURIComponent(s.agentName)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title="View agent"
                                  className="inline-flex min-w-0 shrink items-center gap-1 transition-colors hover:text-foreground"
                                >
                                  <AgentIcon
                                    name={s.agentName}
                                    filled
                                    className="size-3 shrink-0"
                                  />
                                  <span className="truncate">
                                    {s.agentName}
                                  </span>
                                </Link>
                              )}
                              {s.customerId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    patchParams({ customer: s.customerId! });
                                  }}
                                  title="Filter by customer"
                                  className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                                >
                                  <CustomerAvatar
                                    filled
                                    customerId={s.customerId}
                                    customerName={s.customerName}
                                    imageUrl={s.customerImageUrl}
                                    className="size-3 shrink-0"
                                  />
                                  <span className="truncate">
                                    {s.customerName ?? s.customerId}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          {formatCount(s.turnCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatTokens(s.totalTokens)}
                        </TableCell>
                        <HeatCell
                          value={s.totalCost}
                          thresholds={costQuantiles}
                          bold
                          mutedWhenZero
                        >
                          {formatCost(s.totalCost, 4)}
                        </HeatCell>
                        <TableCell
                          align="right"
                          className="text-muted-foreground "
                        >
                          <RelativeTime value={s.lastSeen} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>

            {!sessions.isLoading && rows.length > 0 && (
              <PaginationFooter
                page={page}
                pageSize={pageSize}
                total={summary?.sessionCount ?? 0}
                shown={rows.length}
                noun={["session", "sessions"]}
                isFetching={sessions.isFetching}
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
  { w: "w-48", sub: "w-40" },
  { align: "right", w: "w-8" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-16" },
  { align: "right", w: "w-14" },
] as const;
