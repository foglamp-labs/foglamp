"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

// App-wide banner shown when the org nears (≥90%) or exceeds its monthly span
// quota. Reads the same usage endpoint as the Usage tab; polls so it clears
// once the period resets or the org upgrades.
export function QuotaBanner() {
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
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
        over
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      <span>
        {over
          ? "Monthly span quota exceeded — new spans are being rejected."
          : `You've used ${Math.round(pct * 100)}% of your monthly span quota.`}
      </span>
      <Link href="/settings/org" className="font-medium whitespace-nowrap underline">
        {over ? "Upgrade now" : "Review billing"}
      </Link>
    </div>
  );
}
