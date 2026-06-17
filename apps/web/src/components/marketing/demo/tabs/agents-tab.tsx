"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { IconAlertTriangle } from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { AgentIcon } from "@/components/app/agent-icon";
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
import { AGENTS, quintiles } from "../mock-data";

// Cost quintiles across the listed agents drive the per-card heat shade.
const COST_QUANTILES = quintiles(AGENTS.map((a) => a.costValue));

export function AgentsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Agents"
        description="Per-agent cost, latency, and token usage."
        icon={navItem("/agents")?.icon}
        iconClassName={navItem("/agents")?.iconClassName}
      />

      <DemoToolbar>
        <DemoSearch placeholder="Search agents…" />
        <DemoToggle icon={IconAlertTriangle} label="Errors only" />
        <div className="ml-auto">
          <DemoRangePill />
        </div>
      </DemoToolbar>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => {
          const bucket = percentileBucket(a.costValue, COST_QUANTILES);
          const hasErrors = Number(a.errorCount) > 0;
          return (
            <Card
              key={a.name}
              size="sm"
              className="cursor-pointer transition-colors hover:bg-accent/40"
              onClick={() => openDetail({ type: "agent", id: a.name })}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AgentIcon name={a.name} className="size-4" />
                  <span className="truncate">{a.name}</span>
                  {hasErrors && (
                    <Badge variant="rose" className="ml-auto shrink-0">
                      <IconAlertTriangle className="size-3" />
                      {a.errorCount}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
                <Stat
                  label="Spans"
                  value={`${a.spanCount} · ${a.llmSpanCount} LLM`}
                />
                <Stat label="Tokens" value={a.totalTokens} />
                <Stat label="Latency p95" value={a.p95} />
                <Stat
                  label="Cost"
                  value={a.cost}
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
