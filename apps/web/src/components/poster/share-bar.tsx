"use client";

import type { NodeKind } from "@foglamp/contracts/poster";
import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { IconCircleCheckFilled, IconLink, IconMoon, IconSun } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";

import { KIND_STYLES } from "./kinds";

// Swap between two icons with the same spring blur/scale transition as
// components/app/copy-icon.tsx. `swapKey` drives the enter/exit.
function IconSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
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

export function ShareBar({
  kinds,
  focusKind,
  onFocusKind,
}: {
  kinds: NodeKind[];
  focusKind: NodeKind | null;
  onFocusKind: (kind: NodeKind) => void;
}) {
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
    <>
      {/* Legend — floats bare on the canvas, top-right. Click to spotlight a kind. */}
      {kinds.length > 0 ? (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
          {kinds.map((k) => {
            const active = focusKind === k;
            const dimmed = focusKind !== null && !active;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onFocusKind(k)}
                className={cn(
                  "flex cursor-pointer items-center gap-1 text-[10px] font-medium uppercase tracking-wider transition-all",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground/70 hover:text-foreground",
                  dimmed && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-transform",
                    KIND_STYLES[k].bar,
                    active ? "scale-125" : "opacity-80"
                  )}
                />
                {KIND_STYLES[k].label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex gap-2">
        <Button variant="secondary" onClick={copyLink}>
          <IconSwap swapKey={copied ? "check" : "link"}>
            {copied ? (
              <IconCircleCheckFilled className="text-green-600 dark:text-green-400" />
            ) : (
              <IconLink />
            )}
          </IconSwap>
          Copy link
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          <IconSwap swapKey={isDark ? "sun" : "moon"}>
            {isDark ? <IconSun /> : <IconMoon />}
          </IconSwap>
        </Button>
      </div>
    </>
  );
}
