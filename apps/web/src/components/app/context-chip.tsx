import { Button } from "@foglamp/ui/components/button";
import { IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

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
  const className =
    "max-w-xs justify-start bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted font-normal transition-[color,box-shadow] active:scale-100 dark:border-0 dark:shadow-(--custom-outline-shadow)";
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
