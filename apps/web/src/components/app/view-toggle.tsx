"use client";

import { IconLayoutGrid, IconLayoutList } from "@tabler/icons-react";
import { cn } from "@foglamp/ui/lib/utils";
import { motion } from "motion/react";
import { useEffect, useId, useState } from "react";

// Same spring the eval dialog uses for its sample-rate pill, so segmented
// controls across the app glide identically.
const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

export type ViewMode = "cards" | "table";

const OPTIONS: {
  value: ViewMode;
  label: string;
  icon: typeof IconLayoutGrid;
}[] = [
  { value: "cards", label: "Card view", icon: IconLayoutGrid },
  { value: "table", label: "Table view", icon: IconLayoutList },
];

/**
 * Remembers a page's card/table preference across navigations and reloads.
 * Reads localStorage only after mount so SSR and the first client render match
 * (both use `fallback`), then swaps to the saved value.
 */
export function useViewMode(key: string, fallback: ViewMode = "cards") {
  const storageKey = `foglamp:view:${key}`;
  const [mode, setMode] = useState<ViewMode>(fallback);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "cards" || saved === "table") setMode(saved);
  }, [storageKey]);

  const update = (next: ViewMode) => {
    setMode(next);
    localStorage.setItem(storageKey, next);
  };

  return [mode, update] as const;
}

/** A two-option segmented control for switching between card and table layouts.
 * Sized to sit flush next to a `size="sm"` button (e.g. the RangePicker). */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  // Unique per instance so each mounted toggle owns its own sliding pill.
  const pillId = useId();
  return (
    <div className="inline-flex h-8 items-center rounded-2xl corner-squircle px-1 shadow-(--custom-shadow) p-0.5 dark:bg-input/20">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.label}
            aria-pressed={active}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex h-6 w-7 cursor-pointer items-center justify-center rounded-2xl corner-squircle transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                transition={MORPH}
                className="absolute inset-0 rounded-2xl corner-squircle bg-muted shadow-(--custom-shadow) dark:bg-input/50"
              />
            )}
            <Icon className="relative z-10 size-4 stroke-[1.5]" />
          </button>
        );
      })}
    </div>
  );
}
