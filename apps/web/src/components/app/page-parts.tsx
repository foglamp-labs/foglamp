"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChevronRight,
  IconCircleArrowDownFilled,
  IconCircleArrowUpFilled,
  IconFolderOff,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

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
  titleLeading,
  titleTrailing,
  description,
  actions,
  back,
  icon: TitleIcon,
  iconClassName,
}: {
  title: string;
  /** Inline element rendered right before the title (e.g. an agent's colored
   * icon), sitting after the breadcrumb chevron when `back` is set. */
  titleLeading?: React.ReactNode;
  /** Inline element rendered right after the title (e.g. a copy-id button). */
  titleTrailing?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** When set, renders a `[icon] Label › Title` breadcrumb instead of a plain
   * title — the icon + label link back to the parent page. */
  back?: PageHeaderBack;
  /** Section icon rendered before the title (e.g. the nav icon on a list page).
   * Ignored when `back` is set, since the breadcrumb already shows an icon. */
  icon?: Icon;
  iconClassName?: string;
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
            {titleLeading}
            <span className="truncate">{title}</span>
            {titleTrailing}
          </h1>
        ) : (
          <h1 className="flex items-center gap-2 text-base font-medium tracking-tight">
            {TitleIcon && (
              <TitleIcon className={cn("size-4.5 shrink-0", iconClassName)} />
            )}
            {titleLeading}
            <span className="truncate">{title}</span>
            {titleTrailing}
          </h1>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A single metric tile for a stat strip. Within a strip, order cards by the
 * canonical narrative — **Volume → Health → Performance → Cost** — i.e. lead
 * with the primary count/throughput (e.g. Traces, Runs, Spans), then health
 * (errors / pass rate), then performance (latency / duration), and always
 * close with cost. Cost is the bottom-line figure and sits last everywhere.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaInverted = false,
  size = "default",
  icon: Icon,
  iconClassName,
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
  /** Optional glyph shown in the card's top-right corner (prefer a filled
   * variant). */
  icon?: Icon;
  /** Color class for the icon, e.g. `text-amber-500`. Defaults to muted. */
  iconClassName?: string;
}) {
  return (
    <Card size={size}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className="flex items-baseline gap-2">
          <CardTitle className={cn("tracking-tight tabular-nums")}>
            {value}
          </CardTitle>
          {delta && <DeltaBadge delta={delta} inverted={deltaInverted} />}
        </div>
        {Icon && (
          <CardAction>
            <Icon
              className={cn("size-4 text-muted-foreground", iconClassName)}
            />
          </CardAction>
        )}
      </CardHeader>
      {hint && (
        <CardContent className="text-xs text-muted-foreground/70 line-clamp-1 truncate">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

function DeltaBadge({ delta, inverted }: { delta: Delta; inverted: boolean }) {
  if (delta.dir === "flat") {
    return (
      <span className="text-xs font-medium tabular-nums text-muted-foreground mt-px">
        ~0%
      </span>
    );
  }
  const up = delta.dir === "up";
  const good = inverted ? !up : up;
  const Arrow = up ? IconCircleArrowUpFilled : IconCircleArrowDownFilled;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums mt-px",
        good
          ? "text-emerald-600 dark:text-emerald-500"
          : "text-rose-600 dark:text-rose-500"
      )}
      title="vs. previous period"
    >
      {Math.abs(Math.round(delta.pct * 100))}%
      <Arrow className="size-[13px]" />
    </span>
  );
}

/**
 * A scroll viewport with fade overlays: the top fade appears once scrolled away
 * from the top, the bottom fade while there's more content below. Both track the
 * live scroll position (and recompute when the content size changes, e.g. data
 * finishes loading). `fromClassName` sets the fade's solid color — default
 * `from-card` for in-card lists; pass `from-popover` inside a dialog.
 */
export function ScrollFade({
  children,
  className,
  containerClassName,
  fromClassName = "from-card",
}: {
  children: React.ReactNode;
  /** Classes for the scroll viewport (e.g. `max-h-88`, padding). */
  className?: string;
  /** Classes for the outer wrapper — use to make the fade box participate in a
   * flex column (`min-h-0 flex-1`) instead of a fixed max-height. */
  containerClassName?: string;
  fromClassName?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    setEdges({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);
  useLayoutEffect(() => {
    update();
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  return (
    <div className={cn("relative no-scrollbar", containerClassName)}>
      <div
        ref={viewport}
        onScroll={update}
        className={cn("overflow-y-auto no-scrollbar", className)}
      >
        <div ref={content}>{children}</div>
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b to-transparent transition-opacity duration-150",
          fromClassName,
          edges.top ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t to-transparent transition-opacity duration-150",
          fromClassName,
          edges.bottom ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
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
