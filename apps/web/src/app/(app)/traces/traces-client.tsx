"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
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
  IconPlus,
  IconSitemap,
  IconSitemapFilled,
  IconTag,
  IconTagFilled,
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
  SortableHead,
  ToggleChip,
  Toolbar,
  cycleSortParam,
  parseSortParam,
  useFilterGroupItem,
  useUrlFilters,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { useDelayedLoading, useEntranceOnce } from "@/components/app/hooks";
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
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
  formatCostFixed,
  formatCount,
  formatDuration,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { TracesHeader } from "./header";

const PAGE_SIZES = [25, 50, 100];

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

type SecondaryFilter = "workflow" | "customer" | "meta";

/** The "+ Filter" menu that summons the collapsed secondary filters. A separate
 * component (rendered inside Toolbar) so useFilterGroupItem sees the toolbar's
 * FilterGroupContext and the menu joins the hover-to-switch behavior of its
 * sibling FilterSelects. */
function AddFilterMenu({
  showWorkflow,
  showCustomer,
  showMeta,
  onAdd,
}: {
  showWorkflow: boolean;
  showCustomer: boolean;
  showMeta: boolean;
  onAdd: (k: SecondaryFilter) => void;
}) {
  const group = useFilterGroupItem();
  // Picking an entry closes the menu, but the new select is only inserted once
  // the close animation completes — inserting immediately shifts the "+ Filter"
  // button (the menu's anchor) mid-exit and the popup visibly drags with it.
  const pendingAdd = useRef<SecondaryFilter | null>(null);
  return (
    <DropdownMenu
      // Non-modal like the filter selects — modal menus scroll-lock the body,
      // which shifts the page on open/close.
      modal={false}
      open={group.open}
      onOpenChange={group.onOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open && pendingAdd.current) {
          onAdd(pendingAdd.current);
          pendingAdd.current = null;
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="font-normal transition-[color,box-shadow] bg-card active:scale-100 text-muted-foreground/50 hover:text-muted-foreground/50 aria-expanded:text-muted-foreground/50"
            onMouseEnter={group.onTriggerMouseEnter}
          />
        }
      >
        {/* Raw hex like the FilterSelect trigger icons — opacity on icons
				    reads muddier than on text. */}
        <IconPlus className="text-[#B8B8B8] dark:text-[#5B5B5B]" />
        Filter
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-auto min-w-36"
        align="start"
        sideOffset={8}
      >
        {!showWorkflow && (
          <DropdownMenuItem
            onClick={() => {
              pendingAdd.current = "workflow";
            }}
          >
            <IconSitemap />
            Workflow
          </DropdownMenuItem>
        )}
        {!showCustomer && (
          <DropdownMenuItem
            onClick={() => {
              pendingAdd.current = "customer";
            }}
          >
            <IconUser />
            Customer
          </DropdownMenuItem>
        )}
        {!showMeta && (
          <DropdownMenuItem
            onClick={() => {
              pendingAdd.current = "meta";
            }}
          >
            <IconTag />
            Metadata
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
    size: "25",
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
  const pageSize = PAGE_SIZES.includes(Number(params.size))
    ? Number(params.size)
    : 25;
  const hasFilters = !!(
    agentFilter ||
    workflowFilter ||
    customerFilter ||
    modelFilter ||
    metaKeyFilter ||
    errorsOnly
  );

  // Secondary filters (workflow/customer/metadata) stay out of the toolbar
  // until applied via the "+ Filter" menu — `added` tracks the ones summoned
  // this session so an empty select can sit open before a value is picked.
  const [added, setAdded] = useState<Set<"workflow" | "customer" | "meta">>(
    () => new Set()
  );
  const addFilter = (k: "workflow" | "customer" | "meta") =>
    setAdded((s) => new Set(s).add(k));
  const removeFilter = (k: "workflow" | "customer" | "meta") =>
    setAdded((s) => {
      const next = new Set(s);
      next.delete(k);
      return next;
    });
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
  // Secondary filters surface once applied (URL) or summoned via "+ Filter".
  const showWorkflow = added.has("workflow") || !!workflowFilter;
  const showCustomer = added.has("customer") || !!customerFilter;
  const showMeta = added.has("meta") || !!metaKeyFilter;
  const canAddFilter = !showWorkflow || !showCustomer || !showMeta;
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
      {/* Toolbar and table chrome always render — even for an empty result —
			    so the range picker and filters stay reachable (an empty range needs
			    the range picker to escape). The empty states swap in for the table
			    only; the body rows wait on the query (skeleton rows below). */}
      <div
        className={cn("flex flex-col gap-4 mt-1", entrance && "page-fade-in")}
      >
        <Toolbar>
          {/* Hero filters stay inline; the rest live behind "+ Filter" and
                only occupy the toolbar while applied (or freshly summoned). */}
          <FilterSelect
            value={agentFilter}
            onChange={(v) => patchParams({ agent: v })}
            allLabel="Any agent"
            icon={IconGhost}
            options={agentOptions}
          />
          <FilterSelect
            value={modelFilter}
            onChange={(v) => patchParams({ model: v })}
            allLabel="Any model"
            icon={IconCpu}
            options={modelOptions}
          />
          {showWorkflow && (
            <FilterSelect
              value={workflowFilter}
              onChange={(v) => {
                patchParams({ workflow: v });
                // Resetting to "Any" dismisses a summoned filter entirely.
                if (!v) removeFilter("workflow");
              }}
              allLabel="Any workflow"
              icon={IconSitemap}
              options={workflowOptions}
            />
          )}
          {showCustomer && (
            <FilterSelect
              value={customerFilter}
              onChange={(v) => {
                patchParams({ customer: v });
                if (!v) removeFilter("customer");
              }}
              allLabel="Any customer"
              icon={IconUser}
              options={customerOptions}
            />
          )}
          {/* Metadata: picking a key pins its value as a column and reveals
                the value picker; picking a value filters the trace set. */}
          {showMeta && (
            <FilterSelect
              value={metaKeyFilter}
              onChange={(v) => {
                patchParams({ metaKey: v, metaValue: "" });
                if (!v) removeFilter("meta");
              }}
              allLabel="Any metadata"
              icon={IconTag}
              options={metaKeyOptions}
            />
          )}
          {showMeta && metaKeyFilter && (
            <FilterSelect
              value={metaValueFilter}
              onChange={(v) => patchParams({ metaValue: v })}
              allLabel={`Any ${metaKeyFilter}`}
              icon={IconTag}
              options={metaValueOptions}
              allowFreeText={metaValuesList.data?.truncated ?? false}
            />
          )}
          {canAddFilter && (
            <AddFilterMenu
              showWorkflow={showWorkflow}
              showCustomer={showCustomer}
              showMeta={showMeta}
              onAdd={addFilter}
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
            onClick={() => {
              patchParams({
                agent: "",
                workflow: "",
                customer: "",
                model: "",
                metaKey: "",
                metaValue: "",
                errors: "",
              });
              setAdded(new Set());
            }}
          />
          <div className="ml-auto">
            <RangeControl value={range} onChange={setRange} />
          </div>
        </Toolbar>

        {!traces.isLoading && rows.length === 0 && page === 0 ? (
          <div className="mt-2 px-8">
            {hasFilters ? (
              <EmptyState
                icon={IconAffiliateFilled}
                title="No matching traces"
                description="Try a different search or clearing filters."
              />
            ) : (
              <EmptyState
                icon={IconAffiliateFilled}
                title="No traces yet"
                description="Run an instrumented call to see traces here."
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
                      className="w-30"
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
                      className="w-38"
                    >
                      Cost
                    </SortableHead>
                    <SortableHead
                      sortKey="when"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-36"
                    >
                      When
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traces.isLoading ? (
                    showSkeleton ? (
                      // The meta column only exists while a meta filter is set.
                      <TableRowsSkeleton
                        cols={
                          metaKeyFilter
                            ? [
                                SKELETON_COLS[0],
                                { w: "w-24" },
                                ...SKELETON_COLS.slice(1),
                              ]
                            : SKELETON_COLS
                        }
                        rowHeight="h-16"
                      />
                    ) : null
                  ) : (
                    rows.map((t) => (
                      <TableRow
                        key={t.traceId}
                        interactive
                        onClick={() =>
                          router.push(
                            `/traces/${encodeURIComponent(t.traceId)}`
                          )
                        }
                      >
                        <TableCell className="h-16">
                          <div className="min-w-0 flex justify-between items-center">
                            {/* min-w-0: flex items refuse to shrink below their content
														    by default, so without it the meta line overflows into the
														    next column instead of truncating. */}
                            <div className="min-w-0 flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {/* Content-first title: the trace's user
                                    message, then an explicit trace name (the
                                    SDK falls back to the agent name, which is
                                    just noise repeated down the column), then
                                    the raw id. */}
                                <span className="truncate text-[14px]">
                                  {t.userMessage ??
                                    (t.traceName && t.traceName !== t.agentName
                                      ? t.traceName
                                      : null) ??
                                    t.traceId}
                                </span>
                                {/* Compact error count — colored text, no pill. */}
                                {t.errorCount > 0 && (
                                  <span
                                    title={`${t.errorCount} ${t.errorCount === 1 ? "error" : "errors"}`}
                                    className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
                                  >
                                    <IconAlertTriangle className="size-3.5 fill-current/20" />
                                    {t.errorCount}
                                  </span>
                                )}
                                {t.errorCount === 0 && t.abortedCount > 0 && (
                                  <span
                                    title="Aborted"
                                    className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-amber-600 dark:text-amber-400"
                                  >
                                    <IconPlayerStopFilled className="size-3.5" />
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                {t.models.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      patchParams({ model: t.models[0]! });
                                    }}
                                    title={
                                      t.models.length > 1
                                        ? `${t.models.map(formatModelName).join(", ")} — filter by ${formatModelName(t.models[0])}`
                                        : "Filter by model"
                                    }
                                    className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                                  >
                                    <ModelLogo
                                      modelId={t.models[0]}
                                      className="size-2.75 shrink-0"
                                    />
                                    <span className="truncate">
                                      {formatModelName(t.models[0])}
                                      {t.models.length > 1
                                        ? ` +${t.models.length - 1}`
                                        : ""}
                                    </span>
                                  </button>
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
                                {t.customerId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      patchParams({
                                        customer: t.customerId!,
                                      });
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
                              <span className="text-muted-foreground/40">
                                —
                              </span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
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
                          {formatSpanDuration(t.durationMs)}
                        </HeatCell>
                        <HeatCell
                          value={t.totalCost}
                          thresholds={costQuantiles}
                          metric="cost"
                          bold
                        >
                          {formatCostFixed(t.totalCost, 6)}
                        </HeatCell>
                        <TableCell className="text-right text-muted-foreground">
                          <RelativeTime value={t.startTime} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>

            {!traces.isLoading && rows.length > 0 && (
              <PaginationFooter
                page={page}
                pageSize={pageSize}
                total={summary?.traceCount ?? 0}
                shown={rows.length}
                noun={["trace", "traces"]}
                isFetching={traces.isFetching}
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
  { w: "w-40", sub: "w-56" },
  { align: "right", w: "w-10" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-16" },
  { align: "right", w: "w-14" },
] as const;
