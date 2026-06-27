"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";

import { cn } from "@foglamp/ui/lib/utils";

export function CopyButton({
  text,
  label = "Copy prompt",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard unavailable
        }
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:translate-y-px",
        className,
      )}
    >
      {copied ? <IconCheck size={16} stroke={2} /> : <IconCopy size={16} stroke={2} />}
      {copied ? "Copied" : label}
    </button>
  );
}
