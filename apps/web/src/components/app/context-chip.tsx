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
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      className="max-w-xs justify-start font-normal transition-[color,box-shadow] active:scale-100 dark:border-0 dark:shadow-(--custom-outline-shadow)"
      render={
        // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
        <Link href={href as any} />
      }
    >
      <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
      <span className="truncate">{label}</span>
      <IconArrowUpRight className="size-3.5 shrink-0 -ml-0.5 mt-px text-muted-foreground" />
    </Button>
  );
}
