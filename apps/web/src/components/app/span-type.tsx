import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconCircleDashed,
  IconGhost,
  IconSparkles,
  IconTool,
  IconVector,
} from "@tabler/icons-react";

type BadgeVariant = "violet" | "blue" | "amber" | "emerald" | "secondary";

// Badge color per span type. Shared so the type badge, its waterfall bar, and
// any other surface read as one consistent palette.
export const SPAN_TYPE_VARIANT: Record<string, BadgeVariant> = {
  llm: "violet",
  tool: "blue",
  agent: "amber",
  embedding: "emerald",
  other: "secondary",
};

// Icon per span type: a model (llm), a wrench (tool), a ghost (agent), a vector
// (embedding), falling back to a dashed circle for anything else.
export const SPAN_TYPE_ICON: Record<string, Icon> = {
  llm: IconSparkles,
  tool: IconTool,
  agent: IconGhost,
  embedding: IconVector,
  other: IconCircleDashed,
};

// Waterfall bar fill per span type — mirrors the badge color so a row's label
// and its bar read as one.
export const SPAN_TYPE_BAR: Record<string, string> = {
  llm: "bg-violet-500",
  tool: "bg-blue-500",
  agent: "bg-amber-500",
  embedding: "bg-emerald-500",
  other: "bg-slate-500",
};

export function spanTypeIcon(type: string): Icon {
  return SPAN_TYPE_ICON[type] ?? IconCircleDashed;
}

export function spanTypeVariant(type: string): BadgeVariant {
  return SPAN_TYPE_VARIANT[type] ?? "secondary";
}

export function spanTypeBar(type: string): string {
  return SPAN_TYPE_BAR[type] ?? "bg-primary/70";
}

// Icon-chip palette per span type — a tinted fill + matching foreground, for the
// compact icon-only chip used where a full text badge would be too wide (e.g.
// the waterfall's label gutter).
export const SPAN_TYPE_CHIP: Record<string, string> = {
  llm: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  tool: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  agent: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  embedding: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  other: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export function spanTypeChip(type: string): string {
  return SPAN_TYPE_CHIP[type] ?? "bg-primary/15 text-primary";
}

/** A compact, icon-only span-type chip — the type's color + icon in a small
 * rounded square, with the type name as a tooltip. Used where horizontal space
 * is tight (the waterfall rows) and the full {@link SpanTypeBadge} is too wide. */
export function SpanTypeChip({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = spanTypeIcon(type);
  return (
    <span
      title={type}
      className={cn(
        "flex size-5 shrink-0 items-center shadow-(--custom-shadow) justify-center rounded-md corner-squircle",
        spanTypeChip(type),
        className
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

/** A span-type pill — the type's color + icon + label, used everywhere a span's
 * kind is shown (waterfall labels, the inspector, the scores panel). */
export function SpanTypeBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = spanTypeIcon(type);
  return (
    <Badge variant={spanTypeVariant(type)} className={cn(className)}>
      <Icon />
      {type}
    </Badge>
  );
}
