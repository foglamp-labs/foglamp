"use client";

import { IconCircleCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@foglamp/ui/lib/utils";

export function CopyIcon({
  copied,
  className,
  checkClassName,
}: {
  copied: boolean;
  /** Classes applied to the copy icon (and the check icon unless `checkClassName` is set). */
  className?: string;
  /** Classes applied to the check icon. Defaults to `className`. */
  checkClassName?: string;
}) {
  // `relative` so the exiting (position: absolute, via popLayout) icon is pinned
  // directly over the entering one instead of momentarily stacking below it.
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "check" : "copy"}
          className="inline-flex"
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.25, bounce: 0 }}
        >
          {copied ? (
            <IconCircleCheckFilled
              className={cn(
                // Page-surface greens. Inside a default-variant Button the chip's
                // bg inverts against the theme, so those call sites pass the
                // inverted pair via `checkClassName`.
                "text-green-600 dark:text-green-400",
                checkClassName ?? className
              )}
            />
          ) : (
            <IconCopyFilled className={className} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
