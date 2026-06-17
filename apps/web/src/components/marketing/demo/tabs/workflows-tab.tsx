"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import { IconAlertTriangle, IconSitemap } from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { HEAT_SHADES, percentileBucket } from "@/components/app/heat-cell";
import { PageHeader } from "@/components/app/page-parts";
import { Stat } from "@/components/app/stat";

import { useDemo } from "../demo-context";
import {
  DemoRangePill,
  DemoSearch,
  DemoToggle,
  DemoToolbar,
} from "../demo-chrome";
import { quintiles, WORKFLOWS } from "../mock-data";

// Cost quintiles across the listed workflows drive the per-card heat shade.
const COST_QUANTILES = quintiles(WORKFLOWS.map((w) => w.costValue));

export function WorkflowsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Grouped runs by workflow."
        icon={navItem("/workflows")?.icon}
        iconClassName={navItem("/workflows")?.iconClassName}
      />

      <DemoToolbar>
        <DemoSearch placeholder="Search workflows…" />
        <DemoToggle icon={IconAlertTriangle} label="Errors only" />
        <div className="ml-auto">
          <DemoRangePill />
        </div>
      </DemoToolbar>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {WORKFLOWS.map((w) => {
          const bucket = percentileBucket(w.costValue, COST_QUANTILES);
          return (
            <Card
              key={w.name}
              size="sm"
              className="cursor-pointer transition-colors hover:bg-accent/40"
              onClick={() => openDetail({ type: "workflow", id: w.name })}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconSitemap className="size-4 shrink-0 text-emerald-500" />
                  <span className="truncate">{w.name}</span>
                  {w.errors > 0 && (
                    <Badge variant="rose" className="ml-auto shrink-0">
                      <IconAlertTriangle className="size-3" />
                      {w.errors}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
                <Stat label="Runs" value={w.runs} />
                <Stat label="Last run" value={w.lastRun} />
                <Stat label="Tokens" value={w.tokens} />
                <Stat
                  label="Cost"
                  value={w.cost}
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
    </>
  );
}
