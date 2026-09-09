"use client";

import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconUser,
  IconUserFilled,
} from "@tabler/icons-react";

import { nav } from "@/components/app/nav";
import { type DemoTab, showInDemo } from "./demo-link";

// The product features a landing section leans on, listed above its heading
// with the same colored chip icons the sidebar uses. Each one opens its tab
// in the hero demo.

type Feature = {
  label: string;
  icon: Icon;
  iconClassName?: string;
  /** Where the hero demo shows this feature. */
  tab: DemoTab;
};

const CUSTOMERS: Feature = {
  label: "Customers",
  // Customers show up in the overview's breakdown.
  tab: "overview",
  icon: IconUserFilled,
  iconClassName:
    "bg-violet-100 dark:bg-violet-950 rounded-[5px] squircle:rounded-xl p-0.5 corner-squircle text-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.14),0_2px_6px_-2px_rgba(139,92,246,0.25)] dark:shadow-(--custom-shadow)",
};

/** Outline twin of the customers chip, for anywhere that wants both states. */
export const CUSTOMERS_OUTLINE_ICON = IconUser;

function fromNav(href: string, tab: DemoTab): Feature {
  const item = nav.find((entry) => entry.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return {
    label: item.label,
    icon: item.activeIcon,
    iconClassName: item.iconClassName,
    tab,
  };
}

export const FEATURES = {
  agents: fromNav("/agents", "agents"),
  workflows: fromNav("/workflows", "workflows"),
  sessions: fromNav("/sessions", "sessions"),
  traces: fromNav("/traces", "traces"),
  evals: fromNav("/evals", "evals"),
  alerts: fromNav("/alerts", "alerts"),
  customers: CUSTOMERS,
} satisfies Record<string, Feature>;

/** Show a feature in the hero demo. Without a demo on the page (small
 * screens) it scrolls back to the hero's still. */
export function openFeature(id: FeatureId) {
  if (!showInDemo(FEATURES[id].tab)) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export type FeatureId = keyof typeof FEATURES;

export function FeatureList({
  features,
  className,
}: {
  features: FeatureId[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {features.map((id) => {
        const { label, icon: Icon, iconClassName } = FEATURES[id];
        return (
          <li key={id}>
            {/* The demo only renders from md up, so below that the chip is a
                plain label: no pointer, no hover, no click. */}
            <button
              type="button"
              onClick={() => openFeature(id)}
              title={`See ${label.toLowerCase()} in the demo`}
              className="-mx-1.5 -my-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors max-md:pointer-events-none md:cursor-pointer md:hover:bg-muted md:hover:text-foreground"
            >
              <span
                className={cn(
                  "grid size-4 place-items-center [&_svg]:size-full!",
                  iconClassName
                )}
              >
                <Icon />
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
