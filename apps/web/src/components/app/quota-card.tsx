"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { IconAlertTriangleFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

// Small sidebar card shown when the org nears (≥90%) or exceeds its monthly
// span quota. Reads the same usage endpoint as the Usage tab; polls so it
// clears once the period resets or the org upgrades.
export function QuotaCard() {
  const { project } = useProject();
  const orgId = project?.orgId;
  const usage = useQuery({
    ...trpc.orgs.usage.queryOptions({ orgId: orgId! }),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const pct = usage.data?.spans.pct;
  if (pct == null || pct < 0.9) return null;
  const over = pct >= 1;

  return (
    <div
      className={cn(
        "mb-1 flex flex-col gap-2 rounded-3xl squircle:rounded-[40px] corner-squircle p-3 px-3.5 text-xs",
        over
          ? "border-destructive/30 bg-destructive/10 text-destructive shadow-(--custom-shadow-destructive)"
          : "border-amber-500/10 bg-amber-500/10 text-amber-700 dark:text-amber-400 border"
      )}
    >
      <div className="flex gap-1.5 items-center">
        <IconAlertTriangleFilled className="size-3" />
        <span className="font-medium text-[13px]">
          {over
            ? "Span quota exceeded"
            : `${Math.round(pct * 100)}% of span quota used`}
        </span>
      </div>

      <div
        className={cn(
          "h-1 w-full overflow-hidden rounded-full mt-1",
          over ? "bg-destructive/20" : "bg-amber-500/20"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-destructive" : "bg-amber-500"
          )}
          style={{ width: `${Math.min(pct, 1) * 100}%` }}
        />
      </div>
      {!over && (
        <span className="text-muted-foreground">
          Resets at the start of next month.
        </span>
      )}
      <Button
        variant="ghost-destructive"
        size="sm"
        className="mt-1 w-full"
        render={<Link href="/settings/org?tab=billing" />}
      >
        {over ? "Upgrade now" : "Review billing"}
      </Button>
    </div>
  );
}
