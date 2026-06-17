"use client";

import { cn } from "@foglamp/ui/lib/utils";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconLayoutGrid,
  IconLayoutList,
  IconSearch,
  type Icon,
} from "@tabler/icons-react";

// Inert chrome that mirrors the dashboard's toolbar widgets (range picker,
// search, filter, toggle) without wiring up the real interactive hooks — the
// demo only needs them to read as a faithful replica.

export function DemoRangePill() {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-2xl corner-squircle bg-card px-3 text-sm shadow-(--custom-shadow)">
      <IconCalendar className="size-3.5 text-muted-foreground" />
      Last 24 hours
      <IconChevronDown className="size-3.5 opacity-50" />
    </span>
  );
}

export function DemoToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

// A `[icon] Parent › Title` breadcrumb header for detail views. The parent crumb
// is a button that pops back to the list (no routing in the demo).
export function DetailHeader({
  backIcon: BackIcon,
  backLabel,
  backIconClassName,
  title,
  description,
  actions,
  onBack,
}: {
  backIcon: Icon;
  backLabel: string;
  backIconClassName?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="flex items-center gap-1.5 text-base font-medium tracking-tight">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 cursor-pointer items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <BackIcon className={cn("size-4.5 shrink-0", backIconClassName)} />
            {backLabel}
          </button>
          <IconChevronRight className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground/50" />
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="truncate text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DemoSearch({ placeholder }: { placeholder: string }) {
  return (
    <span className="inline-flex h-8 w-56 items-center gap-2 rounded-2xl corner-squircle bg-card px-3 text-sm text-muted-foreground shadow-(--custom-shadow)">
      <IconSearch className="size-3.5" />
      {placeholder}
    </span>
  );
}

export function DemoFilter({
  icon: Icon,
  label,
}: {
  icon: Icon;
  label: string;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-2xl corner-squircle bg-card px-3 text-sm text-muted-foreground shadow-(--custom-shadow)">
      <Icon className="size-3.5" />
      {label}
      <IconChevronDown className="size-3.5 opacity-50" />
    </span>
  );
}

export function DemoToggle({
  icon: Icon,
  label,
  active = false,
}: {
  icon: Icon;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-2xl corner-squircle px-3 text-sm shadow-(--custom-shadow)",
        active
          ? "bg-foreground/90 text-background"
          : "bg-card text-muted-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}
