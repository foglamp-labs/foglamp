"use client";

import { Badge } from "@foglamp/ui/components/badge";
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
  IconGhost,
  IconSitemap,
  IconSitemapFilled,
} from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { AgentIcon } from "@/components/app/agent-icon";
import { HeatCell } from "@/components/app/heat-cell";
import { PageHeader } from "@/components/app/page-parts";
import { ModelLogo } from "@/components/model-logo";

import { useDemo } from "../demo-context";
import {
  DemoFilter,
  DemoRangePill,
  DemoSearch,
  DemoToggle,
  DemoToolbar,
} from "../demo-chrome";
import { quintiles, TRACE_ROWS } from "../mock-data";

// Quintiles drive the heat shade on the Duration and Cost cells.
const COST_QUANTILES = quintiles(TRACE_ROWS.map((t) => t.costValue));
const DURATION_QUANTILES = quintiles(TRACE_ROWS.map((t) => t.durationMs));

export function TracesTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Traces"
        description="Each trace is one top-level generateText / streamText call."
        icon={navItem("/traces")?.icon}
        iconClassName={navItem("/traces")?.iconClassName}
      />

      <div className="flex flex-col gap-4">
        <DemoToolbar>
          <DemoSearch placeholder="Search trace name…" />
          <DemoFilter icon={IconGhost} label="Any agent" />
          <DemoFilter icon={IconSitemap} label="Any workflow" />
          <DemoToggle icon={IconAlertTriangle} label="Errors only" />
          <div className="ml-auto">
            <DemoRangePill />
          </div>
        </DemoToolbar>

        <TooltipProvider delay={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trace</TableHead>
                <TableHead className="text-right">Spans</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRACE_ROWS.map((t) => {
                return (
                  <TableRow
                    key={t.traceId}
                    interactive
                    onClick={() => openDetail({ type: "trace", id: t.traceId })}
                    className={cn(
                      // Left accent bar on errored traces — scannable at a glance.
                      t.errors &&
                        "shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
                    )}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">{t.name}</span>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex min-w-0 shrink items-center gap-1.5">
                              <ModelLogo
                                modelId={t.model}
                                className="size-2.5 shrink-0"
                              />
                              <span className="truncate">{t.model}</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail({ type: "agent", id: t.agentName });
                              }}
                              className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                            >
                              <AgentIcon
                                name={t.agentName}
                                filled
                                className="size-3 shrink-0"
                              />
                              <span className="truncate">{t.agentName}</span>
                            </button>
                            {t.workflowName && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetail({
                                    type: "workflow",
                                    id: t.workflowName!,
                                  });
                                }}
                                className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                              >
                                <IconSitemapFilled className="size-3 shrink-0 text-emerald-500" />
                                <span className="truncate">
                                  {t.workflowName}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                        {t.errors ? (
                          <Badge variant="rose" className="shrink-0 font-sans">
                            <IconAlertTriangle />
                            {t.errors}
                            {t.errors === 1 ? " error" : " errors"}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.spans}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.tokens}
                    </TableCell>
                    <HeatCell
                      value={t.durationMs}
                      thresholds={DURATION_QUANTILES}
                      metric="duration"
                    >
                      {t.duration}
                    </HeatCell>
                    <HeatCell
                      value={t.costValue}
                      thresholds={COST_QUANTILES}
                      metric="cost"
                      bold
                    >
                      {t.cost}
                    </HeatCell>
                    <TableCell className="text-right text-muted-foreground">
                      {t.when}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </>
  );
}
