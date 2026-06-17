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
import { IconAlertTriangle, IconGhost } from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { HeatCell } from "@/components/app/heat-cell";
import { PageHeader } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import {
  DemoFilter,
  DemoRangePill,
  DemoSearch,
  DemoToggle,
  DemoToolbar,
} from "../demo-chrome";
import { quintiles, SESSIONS } from "../mock-data";

// Cost quintiles across the listed sessions drive the Cost cell heat shade.
const COST_QUANTILES = quintiles(SESSIONS.map((s) => s.costValue));

export function SessionsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Multi-turn conversations grouped by sessionId."
        icon={navItem("/sessions")?.icon}
        iconClassName={navItem("/sessions")?.iconClassName}
      />
      <div className="flex flex-col gap-4">
        <DemoToolbar>
          <DemoSearch placeholder="Search session id…" />
          <DemoFilter icon={IconGhost} label="Any agent" />
          <DemoToggle icon={IconAlertTriangle} label="Errors only" />
          <div className="ml-auto">
            <DemoRangePill />
          </div>
        </DemoToolbar>

        <TooltipProvider delay={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Turns</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SESSIONS.map((s) => (
                <TableRow
                  key={s.sessionId}
                  interactive
                  onClick={() =>
                    openDetail({ type: "session", id: s.sessionId })
                  }
                  className={cn(
                    // Left accent bar on errored sessions — scannable at a glance.
                    s.errorCount > 0 &&
                      "shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
                  )}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span className="truncate">{s.sessionId}</span>
                      {s.errorCount > 0 && (
                        <Badge variant="rose" className="ml-auto font-sans">
                          <IconAlertTriangle />
                          {s.errorCount}
                          {s.errorCount === 1 ? " error" : " errors"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{s.agentName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.turns}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.tokens}
                  </TableCell>
                  <HeatCell
                    value={s.costValue}
                    thresholds={COST_QUANTILES}
                    bold
                    mutedWhenZero
                  >
                    {s.cost}
                  </HeatCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.when}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </>
  );
}
