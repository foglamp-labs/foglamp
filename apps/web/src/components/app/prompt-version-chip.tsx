"use client";

import { Badge } from "@foglamp/ui/components/badge";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Where an agent's inferred prompt versions are listed. */
export function promptVersionsHref(agentName: string): string {
  return `/agents/${encodeURIComponent(agentName)}#prompt-versions`;
}

/**
 * `v3` chip for a run's inferred prompt version. Links to the agent page's
 * prompt versions when the agent is known. Renders nothing when the prompt
 * job hasn't seen the run's prompt yet (or the prompt isn't recorded).
 */
export function PromptVersionChip({
  version,
  agentName,
  className,
}: {
  version: { id: string; number: number } | null | undefined;
  agentName: string | null | undefined;
  className?: string;
}) {
  if (!version) return null;
  const label = `v${version.number}`;
  const classes = cn("font-mono tabular-nums", className);
  if (!agentName) {
    return (
      <Badge variant="sky" size="sm" className={classes} title="Prompt version">
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="sky"
      size="sm"
      className={classes}
      title="Prompt version — see all versions"
      // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
      render={<Link href={promptVersionsHref(agentName) as any} />}
    >
      {label}
    </Badge>
  );
}
