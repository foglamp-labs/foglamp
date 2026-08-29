import { Button } from "@foglamp/ui/components/button";
import { IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** The chip surface shared by every pill that names an entity or a step —
 * the FilterSelect trigger look: card fill, outline shadow in dark, instant
 * background hover, no press scale. Pair with an outline Button. */
export const CHIP_SURFACE =
  "bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted font-normal transition-[color,box-shadow] active:scale-100 dark:border-0 dark:shadow-(--custom-outline-shadow)";

/** Rose/amber tints for a chip whose entity failed or was cancelled — the
 * same surface, with the border and text coloured. */
export const CHIP_ERROR =
  "border-rose-500/40 text-rose-600 dark:text-rose-400 dark:shadow-[0_0_0_1px_rgba(244,63,94,0.4)]";
export const CHIP_ABORTED =
  "border-amber-500/40 text-amber-600 dark:text-amber-400 dark:shadow-[0_0_0_1px_rgba(245,158,11,0.4)]";

/**
 * A compact (`xs`) chip on the ContextChip surface, for inline runs of
 * chips — a run's steps, a turn's tool calls. Static unless `onClick` or
 * `href` is given; `tone` tints failures.
 */
export function Chip({
  icon,
  label,
  trailing,
  tone = "ok",
  href,
  onClick,
  title,
  className,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Muted text after the label (a duration, a `×N` count). */
  trailing?: React.ReactNode;
  tone?: "ok" | "error" | "aborted";
  href?: string;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const content = (
    <>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {trailing && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {trailing}
        </span>
      )}
    </>
  );
  const interactive = Boolean(href || onClick);
  const cls = cn(
    "max-w-64 justify-start",
    CHIP_SURFACE,
    "dark:bg-muted-foreground/10 dark:hover:bg-muted-foreground/20",
    tone === "error" && CHIP_ERROR,
    tone === "aborted" && CHIP_ABORTED,
    !interactive && "pointer-events-none",
    className,
  );
  if (href) {
    return (
      <Button
        variant="outline"
        size="xs"
        className={cls}
        title={title}
        // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
        render={<Link href={href as any} />}
      >
        {content}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="xs"
      className={cls}
      title={title}
      onClick={onClick}
      render={interactive ? undefined : <div />}
    >
      {content}
    </Button>
  );
}

/**
 * Linked-entity pill on detail pages (owning session / workflow / agent /
 * customer). The FilterSelect trigger surface from the traces list, minus the
 * dropdown-only bits: outline Button, no press scale, instant background
 * hover, and the dark border swapped for the outline shadow.
 */
export function ContextChip({
  href,
  icon: Icon,
  iconClassName,
  label,
}: {
  /** Link target. Omit for a static, non-interactive chip (same surface, no
   * arrow, no hover) — e.g. an eval's definition facts. */
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  label: string;
}) {
  const content = (
    <>
      <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
      <span className="truncate">{label}</span>
      {href && (
        <IconArrowUpRight className="size-3.5 shrink-0 -ml-0.5 mt-px text-muted-foreground" />
      )}
    </>
  );
  const className = cn("max-w-xs justify-start", CHIP_SURFACE);
  if (!href) {
    return (
      <Button
        variant="outline"
        className={cn(className, "pointer-events-none")}
        render={<div />}
      >
        {content}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      className={className}
      render={
        // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
        <Link href={href as any} />
      }
    >
      {content}
    </Button>
  );
}
