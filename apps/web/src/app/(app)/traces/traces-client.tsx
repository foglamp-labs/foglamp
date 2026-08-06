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
  IconCpu,
  IconGhost,
  IconMessage2Filled,
  IconPlayerStopFilled,
  IconSitemap,
  IconSitemapFilled,
  IconTag,
  IconTagFilled,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
  ClearFiltersButton,
  FilterSelect,
  SortableHead,
  ToggleChip,
  Toolbar,
  cycleSortParam,
  parseSortParam,
  useUrlFilters,
} from "@/components/app/data-table";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
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

// Colored icons for the dropdown *options* only — the closed trigger keeps the
// neutral outline icon, same as the agent filter (whose options carry colored
// AgentIcons while the trigger idles with a neutral ghost).
const WorkflowIconFilled = (p: { className?: string }) => (
  <IconSitemapFilled className={cn(p.className, "text-emerald-500")} />
);
// Metadata option identity — fuchsia, unclaimed by the other filter entities.
const MetaValueIcon = (p: { className?: string }) => (
  <IconTagFilled className={cn(p.className, "text-fuchsia-500")} />
);

type TraceSortKey = "when" | "cost" | "duration" | "tokens" | "spans";

const TRACE_SORT_KEYS = [
  "when",
  "cost",
  "duration",
  "tokens",
  "spans",
] as const satisfies readonly TraceSortKey[];

export function TracesClient() {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();

  // Filters + sorting (applied server-side across the full result set) live in
  // the URL so the view survives reload/back and can be shared.
  const [params, patchParams] = useUrlFilters({
    agent: "",
    workflow: "",
    customer: "",
    model: "",
    metaKey: "",
    metaValue: "",
    errors: "",
    sort: "",
    page: "1",
  });
  const agentFilter = params.agent;
  const workflowFilter = params.workflow;
  const customerFilter = params.customer;
  const modelFilter = params.model;
  // Metadata: the key alone pins its value as a table column; key + value
  // filters the trace set.
  const metaKeyFilter = params.metaKey;
  const metaValueFilter = params.metaValue;
  const errorsOnly = params.errors === "1";
  const sort = parseSortParam(params.sort, TRACE_SORT_KEYS);
  const toggle = (key: TraceSortKey) =>
    patchParams({ sort: cycleSortParam(sort, key) });
  const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
  const setPage = (p: number) => patchParams({ page: String(p + 1) });
  const hasFilters = !!(
    agentFilter ||
    workflowFilter ||
    customerFilter ||
    modelFilter ||
    metaKeyFilter ||
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

  // Customers for the filter dropdown (cost-desc rollup; ids + display names).
  const customersList = useQuery({
    ...trpc.customers.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId,
  });

  // Models used in the window, for the filter dropdown.
  const modelsList = useQuery({
    ...trpc.metrics.models.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId,
  });

  // Metadata keys seen in the window, for the metadata filter's key picker.
  const metaKeysList = useQuery({
    ...trpc.traces.metadataKeys.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId,
  });

  // Top values for the chosen key (capped server-side; `truncated` switches the
  // value picker into accept-free-text mode for the long tail).
  const metaValuesList = useQuery({
    ...trpc.traces.metadataValues.queryOptions({
      projectId: projectId!,
      key: metaKeyFilter,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
    enabled: !!projectId && !!metaKeyFilter,
  });

  const traces = useQuery({
    ...trpc.traces.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      agentName: agentFilter || undefined,
      workflowName: workflowFilter || undefined,
      customerId: customerFilter || undefined,
      modelId: modelFilter || undefined,
      metadataKey: metaKeyFilter || undefined,
      metadataValue: (metaKeyFilter && metaValueFilter) || undefined,
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
  // Latch for the entrance fade: the content slot only fades in if its skeleton
  // never painted first (see useSkeletonShown).
  const skeletonShown = useSkeletonShown(showSkeleton);

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
    Math.ceil((summary?.traceCount ?? 0) / PAGE_SIZE) || 1,
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
    icon: WorkflowIconFilled,
  }));
  const metaKeyOptions = (metaKeysList.data ?? []).map((key) => ({
    value: key,
    label: key,
    icon: MetaValueIcon,
  }));
  const metaValueOptions = (metaValuesList.data?.values ?? []).map((v) => ({
    value: v,
    label: v,
    icon: MetaValueIcon,
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
  const modelOptions = (modelsList.data ?? [])
    .filter((m) => m.modelId !== "(unknown)")
    .map((m) => ({
      value: m.modelId,
      label: formatModelName(m.modelId),
      icon: (p: { className?: string }) => (
        <ModelLogo modelId={m.modelId} className={p.className} />
      ),
    }));

  return (
    <>
      {/* Wrapped here (not inside TracesHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <TracesHeader />
      </div>
      {traces.isLoading ? (
        showSkeleton ? (
          <div className={cn(entrance && "page-fade-in")}>
            <TableSkeleton />
          </div>
        ) : null
      ) : rows.length === 0 && page === 0 && !hasFilters ? (
        <EmptyState
          icon={IconAffiliateFilled}
          title="No traces yet"
          description="Run an instrumented call to see traces appear here."
          className={cn(entrance && !skeletonShown && "page-fade-in")}
        />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-4",
            entrance && !skeletonShown && "page-fade-in",
          )}
        >
          <Toolbar>
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
            <FilterSelect
              value={customerFilter}
              onChange={(v) => patchParams({ customer: v })}
              allLabel="Any customer"
              icon={IconUser}
              options={customerOptions}
            />
            <FilterSelect
              value={modelFilter}
              onChange={(v) => patchParams({ model: v })}
              allLabel="Any model"
              icon={IconCpu}
              options={modelOptions}
            />
            {/* Metadata: picking a key pins its value as a column and reveals
                the value picker; picking a value filters the trace set. */}
            <FilterSelect
              value={metaKeyFilter}
              onChange={(v) => patchParams({ metaKey: v, metaValue: "" })}
              allLabel="Any metadata"
              icon={IconTag}
              options={metaKeyOptions}
            />
            {metaKeyFilter && (
              <FilterSelect
                value={metaValueFilter}
                onChange={(v) => patchParams({ metaValue: v })}
                allLabel={`Any ${metaKeyFilter}`}
                icon={IconTag}
                options={metaValueOptions}
                allowFreeText={metaValuesList.data?.truncated ?? false}
              />
            )}
            <ToggleChip
              active={errorsOnly}
              onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
            >
              <IconAlertTriangle className="size-3.5" />
              Errors only
            </ToggleChip>
            <ClearFiltersButton
              show={hasFilters}
              onClick={() =>
                patchParams({
                  agent: "",
                  workflow: "",
                  customer: "",
                  model: "",
                  metaKey: "",
                  metaValue: "",
                  errors: "",
                })
              }
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
                      {metaKeyFilter && (
                        <TableHead className="w-40">
                          <span className="inline-flex items-center gap-1.5">
                            <IconTagFilled className="size-3.5 text-fuchsia-500" />
                            {metaKeyFilter}
                          </span>
                        </TableHead>
                      )}
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
                            `/traces/${encodeURIComponent(t.traceId)}`,
                          )
                        }
                        className={cn(
                          // Left accent bar — scannable at a glance. Errors win
                          // over aborts (amber) when a trace has both.
                          t.errorCount > 0
                            ? "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                            : t.abortedCount > 0 &&
                                "shadow-[inset_1px_0_0_0_var(--color-amber-500)]",
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
                                      t.sessionId,
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
                                      t.agentName,
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
                                      t.workflowName,
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
                                {t.customerId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      patchParams({ customer: t.customerId! });
                                    }}
                                    title="Filter by customer"
                                    className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                                  >
                                    <CustomerAvatar
                                      customerId={t.customerId}
                                      customerName={t.customerName}
                                      imageUrl={t.customerImageUrl}
                                      filled
                                      className="size-3 shrink-0"
                                    />
                                    <span className="truncate">
                                      {t.customerName ?? t.customerId}
                                    </span>
                                  </button>
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
                            {t.errorCount === 0 && t.abortedCount > 0 && (
                              <Badge
                                variant="amber"
                                className="shrink-0 font-sans"
                              >
                                <IconPlayerStopFilled />
                                aborted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {metaKeyFilter && (
                          <TableCell>
                            {t.metadataValue ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  patchParams({
                                    metaValue: t.metadataValue!,
                                  });
                                }}
                                title={`Filter by ${metaKeyFilter}: ${t.metadataValue}`}
                                className="block max-w-36 cursor-pointer truncate text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {t.metadataValue}
                              </button>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                        )}
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
                            "pointer-events-none opacity-50",
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
                              traces.isFetching && "pointer-events-none",
                            )}
                            onClick={() => setPage(p - 1)}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext
                        aria-disabled={
                          currentPage >= totalPages || traces.isFetching
                        }
                        className={cn(
                          (currentPage >= totalPages || traces.isFetching) &&
                            "pointer-events-none opacity-50",
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
