"use client";

import type { NodeKind } from "@foglamp/contracts/scan";
import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconCircleCheckFilled,
  IconLink,
  IconMoon,
  IconShare,
  IconShare2,
  IconSun,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";

import { LEGEND_GROUPS } from "./kinds";

// Swap between two icons with the same spring blur/scale transition as
// components/app/copy-icon.tsx. `swapKey` drives the enter/exit.
function IconSwap({
  swapKey,
  children,
}: {
  swapKey: string;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          className="inline-flex"
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Copy-link + theme toggle, rendered in the left column under the rail.
export function ScanActions() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="flex gap-2 w-fit">
      <Button variant="outline" className="flex-1 w-fit" onClick={copyLink}>
        <IconSwap swapKey={copied ? "check" : "link"}>
          {copied ? (
            <IconCircleCheckFilled className="text-green-600 dark:text-green-400" />
          ) : (
            <IconShare2 />
          )}
        </IconSwap>
        Copy link
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        <IconSwap swapKey={isDark ? "sun" : "moon"}>
          {isDark ? <IconSun /> : <IconMoon />}
        </IconSwap>
      </Button>
    </div>
  );
}

export function ShareBar({
  kinds,
  focusKinds,
  onFocusKinds,
}: {
  kinds: NodeKind[];
  focusKinds: NodeKind[] | null;
  onFocusKinds: (kinds: NodeKind[] | null) => void;
}) {
  return (
    <>
      {/* Legend — bottom center, grouped categories. Hovering a group
          spotlights every node of (or embedding) those kinds. */}
      {kinds.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4">
          {LEGEND_GROUPS.filter((g) =>
            g.kinds.some((k) => kinds.includes(k))
          ).map((g) => {
            const active =
              focusKinds !== null &&
              g.kinds.some((k) => focusKinds.includes(k));
            const dimmed = focusKinds !== null && !active;
            return (
              <button
                key={g.label}
                type="button"
                onMouseEnter={() => onFocusKinds(g.kinds)}
                onMouseLeave={() => onFocusKinds(null)}
                className={cn(
                  "flex cursor-default items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider transition-all",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground/70 hover:text-foreground",
                  dimmed && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-transform",
                    g.dot,
                    active ? "scale-125" : "opacity-80"
                  )}
                />
                {g.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
