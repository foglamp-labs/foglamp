"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconSitemapFilled,
  IconTimeline,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ClearFiltersButton,
  SearchInput,
  SortableHead,
  sortRows,
  ToggleChip,
  Toolbar,
  useDelayedLoading,
  useTableSort,
  useTextFilter,
} from "@/components/app/data-table";
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
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
import { useViewMode, ViewToggle } from "@/components/app/view-toggle";
import {
  formatCost,
  formatCount,
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

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

export function WorkflowsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const [view, setView] = useViewMode("workflows", "cards");
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const { sort, toggle } = useTableSort<WorkflowSortKey>();
  const router = useRouter();

  const workflows = useQuery({
    ...trpc.workflows.list.queryOptions({
      projectId: projectId!,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: 100,
    }),
    enabled: !!projectId,
  });

  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(workflows.isLoading);

  const rows = workflows.data ?? [];
  const searched = useTextFilter(rows, search, (w) => [
    w.workflowName ?? "Ungrouped",
  ]);
  const visible = useMemo(
    () =>
      sortRows(
        errorsOnly ? searched.filter((w) => w.errorCount > 0) : searched,
        sort,
        {
          name: (w) => w.workflowName,
          runs: (w) => w.runCount,
          traces: (w) => w.traceCount,
          tokens: (w) => w.totalTokens,
          errors: (w) => w.errorCount,
          cost: (w) => w.totalCost,
          lastRun: (w) => (w.lastRun ? Date.parse(w.lastRun) : null),
        }
      ),
    [searched, errorsOnly, sort]
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Workflows" />
        <NoProject />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Grouped runs by workflow. Open one to see its runs and step flow."
      />
      {workflows.isLoading ? (
        showSkeleton ? (
          view === "cards" ? (
            <CardsSkeleton count={6} />
          ) : (
            <TableSkeleton />
          )
        ) : null
      ) : rows.length === 0 ? (
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
              onClick={() => setErrorsOnly((v) => !v)}
            >
              <IconAlertTriangle className="size-3.5" />
              Errors only
            </ToggleChip>
            <ClearFiltersButton
              show={!!(search || errorsOnly)}
              onClick={() => {
                setSearch("");
                setErrorsOnly(false);
              }}
            />
            <div className="ml-auto flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <RangePicker value={range} onChange={setRange} />
            </div>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState
              icon={IconTimeline}
              title="No matching workflows"
              description="Try a different search or clearing filters."
            />
          ) : view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((w) => {
                const label = w.workflowName ?? "Ungrouped";
                return (
                  <Card
                    key={workflowSlug(w.workflowName)}
                    className="cursor-pointer transition-colors hover:bg-accent/40"
                    onClick={() =>
                      router.push(`/workflows/${workflowSlug(w.workflowName)}`)
                    }
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <IconTimeline className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{label}</span>
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
                      <Stat label="Traces" value={formatCount(w.traceCount)} />
                      <Stat
                        label="Tokens"
                        value={formatTokens(w.totalTokens)}
                      />
                      <Stat
                        label="Cost"
                        value={formatCost(w.totalCost)}
                        emphasis
                      />
                      <Stat
                        className="col-span-2"
                        label="Last run"
                        value={formatRelative(w.lastRun)}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
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
                    sortKey="errors"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                    className="w-28"
                  >
                    Errors
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
                {visible.map((w) => (
                  <TableRow
                    key={workflowSlug(w.workflowName)}
                    interactive
                    onClick={() =>
                      router.push(`/workflows/${workflowSlug(w.workflowName)}`)
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconTimeline className="size-4 shrink-0 text-muted-foreground" />
                        <span
                          className={cn(
                            "truncate font-medium",
                            !w.workflowName && "text-muted-foreground italic"
                          )}
                        >
                          {w.workflowName ?? "Ungrouped"}
                        </span>
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
                    <TableCell align="right" className="tabular-nums">
                      {w.errorCount > 0 ? (
                        <Badge variant="rose">
                          <IconAlertTriangleFilled />
                          {formatCount(w.errorCount)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums font-medium"
                    >
                      {formatCost(w.totalCost)}
                    </TableCell>
                    <TableCell align="right" className="text-muted-foreground">
                      {formatRelative(w.lastRun)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

function Stat({
  label,
  value,
  emphasis,
  className,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${emphasis ? "font-medium" : ""}`}>
        {value}
      </span>
    </div>
  );
}
