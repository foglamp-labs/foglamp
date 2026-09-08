import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconBriefcase,
  IconBriefcaseFilled,
} from "@tabler/icons-react";

import { nav } from "@/components/app/nav";

// The product features a landing section leans on, listed under its button
// with the same colored chip icons the sidebar uses.

type Feature = { label: string; icon: Icon; iconClassName?: string };

const CUSTOMERS: Feature = {
  label: "Customers",
  icon: IconBriefcaseFilled,
  iconClassName:
    "bg-violet-100 dark:bg-violet-950 rounded-[5px] squircle:rounded-xl p-0.5 corner-squircle text-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.14),0_2px_6px_-2px_rgba(139,92,246,0.25)] dark:shadow-(--custom-shadow)",
};

/** Outline twin of the customers chip, for anywhere that wants both states. */
export const CUSTOMERS_OUTLINE_ICON = IconBriefcase;

function fromNav(href: string): Feature {
  const item = nav.find((entry) => entry.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return {
    label: item.label,
    icon: item.activeIcon,
    iconClassName: item.iconClassName,
  };
}

export const FEATURES = {
  agents: fromNav("/agents"),
  workflows: fromNav("/workflows"),
  sessions: fromNav("/sessions"),
  traces: fromNav("/traces"),
  evals: fromNav("/evals"),
  alerts: fromNav("/alerts"),
  customers: CUSTOMERS,
} satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export function FeatureList({
  features,
  className,
}: {
  features: FeatureId[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-2.5", className)}>
      {features.map((id) => {
        const { label, icon: Icon, iconClassName } = FEATURES[id];
        return (
          <li
            key={id}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              className={cn(
                "grid size-4.5 place-items-center [&_svg]:size-full!",
                iconClassName
              )}
            >
              <Icon />
            </span>
            {label}
          </li>
        );
      })}
    </ul>
  );
}
