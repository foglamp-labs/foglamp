"use client";

import {
  type Icon,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChevronRight,
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
import type { Route } from "next";
import Link from "next/link";

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

/**
 * A clickable parent crumb rendered before the page title, e.g. an "Evals"
 * link that takes the user back to the list. Pairs the section's nav icon with
 * its label; the shape is a subset of `NavItem`, so a nav entry can be passed
 * straight through.
 */
export type PageHeaderBack = {
  href: Route;
  label: string;
  icon: Icon;
  iconClassName?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** When set, renders a `[icon] Label › Title` breadcrumb instead of a plain
   * title — the icon + label link back to the parent page. */
  back?: PageHeaderBack;
}) {
  const BackIcon = back?.icon;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && BackIcon ? (
          <h1 className="flex items-center gap-1.5 text-base font-medium tracking-tight">
            <Link
              href={back.href}
              className="flex shrink-0 items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <BackIcon
                className={cn("size-4.5 shrink-0", back.iconClassName)}
              />
              {back.label}
            </Link>
            <IconChevronRight className="size-4 shrink-0 text-muted-foreground/50 stroke-[1.5px]" />
            <span className="truncate">{title}</span>
          </h1>
        ) : (
          <h1 className="text-base font-medium tracking-tight">{title}</h1>
        )}
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
  size = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Period-over-period change (from `formatDelta`); null/undefined hides it. */
  delta?: Delta | null;
  /** When true, "up" is bad (red) — for cost / errors / latency. */
  deltaInverted?: boolean;
  /** "sm" tightens the card padding and value text for dense layouts. */
  size?: "default" | "sm";
}) {
  return (
    <Card size={size}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className={cn("tracking-tight tabular-nums")}>
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

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
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
