"use client";

import {
  IconAlertTriangle,
  IconSitemapFilled,
  IconTimeline,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useRouter } from "next/navigation";

import {
  CardsSkeleton,
  NoProject,
  PageHeader,
} from "@/components/app/page-parts";
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
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

export function WorkflowsClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
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

  if (!projectId) {
    return (
      <>
        <PageHeader title="Workflows" />
        <NoProject />
      </>
    );
  }

  const rows = workflows.data ?? [];

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Grouped runs by workflow. Open one to see its runs and step flow."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {workflows.isLoading ? (
        <CardsSkeleton count={6} />
      ) : rows.length === 0 ? (
        <InstrumentEmptyState
          feature="workflow"
          icon={IconSitemapFilled}
          title="No workflows yet"
          description="Pass a workflowName via the SDK integration to group runs."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => {
            const label = w.workflowName ?? "Ungrouped";
            const slug = w.workflowName
              ? encodeURIComponent(w.workflowName)
              : UNGROUPED;
            return (
              <Card
                key={slug}
                className="cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => router.push(`/workflows/${slug}`)}
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
                  <Stat label="Tokens" value={formatTokens(w.totalTokens)} />
                  <Stat label="Cost" value={formatCost(w.totalCost)} emphasis />
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
      )}
    </>
  );
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
