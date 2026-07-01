"use client";

import type { NodeKind } from "@foglamp/contracts/poster";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
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

export function ShareBar({ kinds }: { kinds: NodeKind[] }) {
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
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      {kinds.length > 0 ? (
        <div className="flex justify-end gap-1.5 rounded-full border bg-card/80 px-4 py-2 backdrop-blur">
          {kinds.map((k) => (
            <Badge key={k} variant={KIND_STYLES[k].badge} size="md">
              {KIND_STYLES[k].label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
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
    </div>
  );
}
