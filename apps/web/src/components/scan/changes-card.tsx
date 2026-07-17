"use client";

import type { ScanData } from "@foglamp/contracts/scan";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconEditFilled,
  IconFileDiffFilled,
  IconMinus,
  IconPlusFilled,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { diffScans } from "./diff";
import { KIND_STYLES } from "./kinds";

// "What changed since the last scan" — shown only for scans that have been
// re-published (the server keeps one previous version). Mirrors the left
// rail's card anatomy: scroll + fade live on the content, spacing matches
// the rail's section lists.
export function ChangesCard({
  data,
  previous,
}: {
  data: ScanData;
  previous: ScanData;
}) {
  const diff = useMemo(() => diffScans(data, previous), [data, previous]);

  // The fade mask (and the bottom padding that gives it room) only earn their
  // space when the list actually scrolls — a short list keeps a snug card.
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [diff]);

  if (!diff.hasChanges) return null;

  return (
    <Card className="flex max-h-[30dvh] flex-col overflow-hidden rounded-[36px] py-0 pr-12 no-scrollbar">
      {/* Scroll (and all vertical padding) lives on the content so the fade
          mask reaches the card edges and dissolves rows, not the card. */}
      <CardContent
        ref={contentRef}
        className={cn(
          "scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 no-scrollbar",
          overflowing && "scroll-fade"
        )}
      >
        <section className={cn("mt-1 px-1", overflowing && "pb-8")}>
          <h2 className="mb-3 flex items-center gap-2 text-xs text-muted-foreground ml-px">
            <IconFileDiffFilled className="size-[12px] opacity-70" />
            <span className="leading-none">Since last scan</span>
          </h2>
          <ul className="flex list-none flex-col gap-3">
            {diff.addedNodes.map((n) => (
              <li key={`+${n.id}`} className="flex items-center gap-2">
                <IconPlusFilled className="size-3.5 flex-none text-green-600 dark:text-green-400" />
                <span className="truncate text-sm font-medium">{n.label}</span>
                <span className="text-xs text-muted-foreground">
                  {KIND_STYLES[n.kind].label.toLowerCase()}
                </span>
              </li>
            ))}
            {diff.removedNodes.map((n) => (
              <li key={`-${n.id}`} className="flex items-center gap-2">
                <IconMinus className="size-3.5 flex-none text-red-600 dark:text-red-400" />
                <span className="truncate text-sm font-medium text-muted-foreground line-through">
                  {n.label}
                </span>
              </li>
            ))}
            {diff.changedNodes.map((n) => (
              <li key={`~${n.id}`} className="flex items-center gap-2">
                <IconEditFilled className="size-3.5 flex-none text-yellow-600 dark:text-yellow-400" />
                <span className="truncate text-sm font-medium">{n.label}</span>
                <span className="text-xs text-muted-foreground">updated</span>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
