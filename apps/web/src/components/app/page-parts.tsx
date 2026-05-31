"use client";

import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconFolderOff,
} from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";

import type { Delta } from "@/lib/format";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { Skeleton } from "@foglamp/ui/components/skeleton";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaInverted = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Period-over-period change (from `formatDelta`); null/undefined hides it. */
  delta?: Delta | null;
  /** When true, "up" is bad (red) — for cost / errors / latency. */
  deltaInverted?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-2xl tracking-tight tabular-nums">
            {value}
          </CardTitle>
          {delta && <DeltaBadge delta={delta} inverted={deltaInverted} />}
        </div>
      </CardHeader>
      {hint && (
        <CardContent className="text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

function DeltaBadge({ delta, inverted }: { delta: Delta; inverted: boolean }) {
  if (delta.dir === "flat") {
    return (
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        ~0%
      </span>
    );
  }
  const up = delta.dir === "up";
  const good = inverted ? !up : up;
  const Arrow = up ? IconArrowUpRight : IconArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        good
          ? "text-emerald-600 dark:text-emerald-500"
          : "text-rose-600 dark:text-rose-500"
      )}
      title="vs. previous period"
    >
      <Arrow className="size-3.5" />
      {Math.abs(Math.round(delta.pct * 100))}%
    </span>
  );
}

export function NoProject() {
  return (
    <Empty className="mt-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFolderOff />
        </EmptyMedia>
        <EmptyContent>
          <EmptyTitle>No project selected</EmptyTitle>
          <EmptyDescription>
            Create a project in Settings, then run the SDK to start seeing data.
          </EmptyDescription>
        </EmptyContent>
      </EmptyHeader>
    </Empty>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="border border-dashed rounded-lg">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="opacity-40" />
        </EmptyMedia>
        <EmptyContent>
          <EmptyTitle>{title}</EmptyTitle>
          {description && <EmptyDescription>{description}</EmptyDescription>}
          {children}
        </EmptyContent>
      </EmptyHeader>
    </Empty>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
