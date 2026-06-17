"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconChevronRight,
  IconCircleArrowDownFilled,
  IconCircleArrowUpFilled,
  IconFolderOff,
  IconMailForward,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@foglamp/ui/components/button";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

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
  chart,
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
  /** Full-bleed visual pinned to the card's bottom edge — e.g. a
   * `CardSparkline` or `PillMeter`. Bleeds past the card's vertical padding. */
  chart?: React.ReactNode;
}) {
  return (
    <Card size={size}>
      <CardHeader className="gap-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            {Icon && (
              <Icon
                className={cn(
                  "size-[13px] shrink-0 text-muted-foreground",
                  iconClassName
                )}
              />
            )}
            <CardDescription>{label}</CardDescription>
          </div>

          {delta && <DeltaBadge delta={delta} inverted={deltaInverted} />}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className={cn("tracking-tight tabular-nums")}>
            {value}
          </CardTitle>
          {hint && (
            <span className="min-w-0 truncate text-end text-xs text-muted-foreground/70">
              {hint}
            </span>
          )}
        </div>
      </CardHeader>

      {chart && (
        <div className="mt-auto -mb-6 group-data-[size=sm]/card:-mb-5">
          {chart}
        </div>
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
      <Arrow className="size-[13px] opacity-90" />
    </span>
  );
}

/**
 * A full-bleed area sparkline for a `StatCard`'s `chart` slot — a compact trend
 * of a volume metric (tokens, cost, requests). The accent color comes from the
 * `text-*` class on `className`; the area fades from that color to transparent.
 * When `dashedLast` is set, the final segment renders dashed to signal the
 * trailing bucket is still filling. With fewer than two finite points it falls
 * back to a faint sample trend (`CardSparklinePlaceholder`) so the card mirrors
 * `PillMeter`'s empty state instead of leaving a blank strip.
 */
export function CardSparkline({
  data,
  dashedLast = false,
  className,
}: {
  data: number[];
  dashedLast?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2) return <CardSparklinePlaceholder />;

  const W = 100;
  const H = 32;
  const PAD = 2;
  const max = Math.max(...pts, 0);
  const span = max > 0 ? max : 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - PAD - (v / span) * (H - PAD);
    return [x, y] as const;
  });

  const toPath = (slice: ReadonlyArray<readonly [number, number]>) =>
    slice
      .map(
        ([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
      )
      .join(" ");

  const linePath = toPath(coords);
  const areaPath = `${linePath} L${W} ${H} L0 ${H} Z`;
  // Split the stroke so the trailing segment can be dashed independently.
  const solid = dashedLast ? coords.slice(0, -1) : coords;
  const tail = dashedLast ? coords.slice(-2) : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("block h-8 w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
      {solid.length >= 2 && (
        <path
          d={toPath(solid)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {tail.length === 2 && (
        <path
          d={toPath(tail)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeDasharray="2.5 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

// A fixed, gently rising sample curve (normalized 0..1, where 1 is the top of
// the strip) drawn when a `CardSparkline` has no real series yet — the
// area-chart counterpart to `PillMeter`'s unlit capsule row.
const SAMPLE_SPARKLINE = [0.3, 0.45, 0.38, 0.55, 0.48, 0.66, 0.58, 0.75];

/** Faint placeholder trend for an empty `CardSparkline`. Ignores the caller's
 * accent and renders in the muted color so the card reads as "trend goes here"
 * rather than leaving a blank strip below the value. */
function CardSparklinePlaceholder() {
  const gid = useId().replace(/:/g, "");
  const W = 100;
  const H = 32;
  const PAD = 2;
  const coords = SAMPLE_SPARKLINE.map((v, i) => {
    const x = (i / (SAMPLE_SPARKLINE.length - 1)) * W;
    const y = H - PAD - v * (H - PAD);
    return [x, y] as const;
  });
  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${W} ${H} L0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-8 w-full text-muted-foreground"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.03} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A segmented "pill" meter for a `StatCard`'s `chart` slot — visualizes a ratio
 * metric (error rate, pass rate) as a row of capsules, the leading `fraction`
 * of which are lit in the accent color (`text-*` on `className`). Any positive
 * fraction lights at least one pill so small-but-nonzero rates stay visible;
 * `null` lights none (no data). Re-adds the card's horizontal inset since the
 * chart slot bleeds full-width.
 */
export function PillMeter({
  fraction,
  count = 32,
  className,
}: {
  fraction: number | null;
  /** Number of capsules in the row. */
  count?: number;
  className?: string;
}) {
  const pct = fraction == null ? 0 : Math.min(Math.max(fraction, 0), 1);
  const filled = pct > 0 ? Math.max(1, Math.round(pct * count)) : 0;
  return (
    <div
      className={cn(
        "px-6 pt-1.5 pb-5 group-data-[size=sm]/card:px-5",
        className
      )}
    >
      <div className="flex h-3.5 items-stretch gap-[3px]">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full",
              i < filled ? "bg-current" : "bg-muted-foreground/10"
            )}
          />
        ))}
      </div>
    </div>
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
  // A user can land here with zero orgs when they signed up off an invitation
  // (the signup hook skips the personal-workspace bootstrap) but never hit the
  // accept page — surface their live invitations so they can recover.
  const invites = useQuery(trpc.orgs.pendingInvitations.queryOptions());
  const [accepting, setAccepting] = useState<string | null>(null);

  const accept = async (invitationId: string) => {
    setAccepting(invitationId);
    const res = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (res.error) {
      toast.error(res.error.message ?? "This invitation is no longer valid.");
      setAccepting(null);
      return;
    }
    // Hard reload so the project list refetches with the new membership.
    window.location.href = "/overview";
  };

  if (invites.data && invites.data.length > 0) {
    return (
      <Empty className="mt-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconMailForward />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>You&apos;ve been invited</EmptyTitle>
            <EmptyDescription>
              Accept an invitation to join its workspace.
            </EmptyDescription>
          </EmptyContent>
        </EmptyHeader>
        <div className="flex flex-col gap-2">
          {invites.data.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-6 rounded-lg border px-4 py-3 text-left"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {invite.orgName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Invited by {invite.inviterName || invite.inviterEmail}
                  {invite.role ? ` · ${invite.role}` : ""}
                </span>
              </div>
              <Button
                size="sm"
                disabled={accepting !== null}
                onClick={() => accept(invite.id)}
              >
                {accepting === invite.id ? "Accepting…" : "Accept"}
              </Button>
            </div>
          ))}
        </div>
      </Empty>
    );
  }

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
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("border border-dashed rounded-lg", className)}>
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
