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
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconGhost,
  IconGhostFilled,
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
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";

type AgentSortKey =
  | "name"
  | "spans"
  | "llm"
  | "tokens"
  | "latency"
  | "errors"
  | "cost";

export function AgentsClient() {
  const { projectId } = useProject();
  const router = useRouter();
  const { range, setRange } = useRange();
  const [view, setView] = useViewMode("agents", "cards");
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const { sort, toggle } = useTableSort<AgentSortKey>();
  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range]
  );

  const agents = useQuery({
    ...trpc.agents.list.queryOptions({ projectId: projectId!, from, to }),
    enabled: !!projectId,
  });

  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(agents.isLoading);

  const rows = agents.data ?? [];
  const searched = useTextFilter(rows, search, (a) => [a.agentName]);
  const visible = useMemo(
    () =>
      sortRows(
        errorsOnly ? searched.filter((a) => a.errorCount > 0) : searched,
        sort,
        {
          name: (a) => a.agentName,
          spans: (a) => a.spanCount,
          llm: (a) => a.llmSpanCount,
          tokens: (a) => a.totalTokens,
          latency: (a) => a.latencyMs.p95,
          errors: (a) => a.errorCount,
          cost: (a) => a.totalCost,
        }
      ),
    [searched, errorsOnly, sort]
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Agents" />
        <NoProject />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agents"
        description="Per-agent cost, latency, and token usage. Open one for its step flow."
      />
      {agents.isLoading ? (
        showSkeleton ? (
          view === "cards" ? (
            <CardsSkeleton count={6} />
          ) : (
            <TableSkeleton />
          )
        ) : null
      ) : rows.length === 0 ? (
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
              icon={IconGhostFilled}
              title="No matching agents"
              description="Try a different search or clearing filters."
            />
          ) : view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a) => (
                <Card
                  key={a.agentName}
                  className="cursor-pointer transition-colors hover:bg-accent/40"
                  onClick={() =>
                    router.push(`/agents/${encodeURIComponent(a.agentName)}`)
                  }
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IconGhost className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{a.agentName}</span>
                      {a.errorCount > 0 && (
                        <Badge variant="rose" className="ml-auto shrink-0">
                          {formatCount(a.errorCount)} err
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
                    <Stat label="Tokens" value={formatTokens(a.totalTokens)} />
                    <Stat
                      label="Latency p95"
                      value={formatDuration(a.latencyMs.p95)}
                    />
                    <Stat
                      label="Cost"
                      value={formatCost(a.totalCost)}
                      emphasis
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((a) => (
                  <TableRow
                    key={a.agentName}
                    interactive
                    onClick={() =>
                      router.push(`/agents/${encodeURIComponent(a.agentName)}`)
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconGhost className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">
                          {a.agentName}
                        </span>
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
                    <TableCell align="right" className="tabular-nums">
                      {a.errorCount > 0 ? (
                        <Badge variant="rose">
                          <IconAlertTriangleFilled />
                          {formatCount(a.errorCount)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums font-medium"
                    >
                      {formatCost(a.totalCost)}
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

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${emphasis ? "font-medium" : ""}`}>
        {value}
      </span>
    </div>
  );
}
