"use client";

import { type DiffOp, lineDiff, SLOT_LINE } from "@foglamp/prompts";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import {
  IconArrowUpRight,
  IconChevronRight,
  IconVersions,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { CopyButton } from "@/components/app/copy-button";
import { useDelayedLoading } from "@/components/app/hooks";
import { EmptyState } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { RelativeTime } from "@/components/app/relative-time";
import { formatCount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

type Version = {
  id: string;
  number: number;
  template: string;
  slotCount: number;
  hashCount: number;
  runCount: number;
  firstSeen: string | Date;
  lastSeen: string | Date;
  current: boolean;
};

/**
 * The system prompts an agent has run with, grouped into versions by the
 * prompt job (see packages/prompts). Newest first; the current version opens
 * by default. Each version shows its template — content that varies between
 * runs is folded into a `{…}` line — and, once expanded, a diff against the
 * previous version.
 */
export function PromptVersionsCard({
  agentName,
  className,
}: {
  agentName: string;
  className?: string;
}) {
  const { projectId } = useProject();
  const query = useQuery({
    ...trpc.agents.promptVersions.queryOptions({
      projectId: projectId!,
      agentName,
    }),
    enabled: !!projectId,
  });
  const versions = useMemo(
    () => (query.data?.versions ?? []) as Version[],
    [query.data]
  );
  const skeleton = useDelayedLoading(query.isLoading);

  // Open the current version on first load; user toggles take over after.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || versions.length === 0) return;
    const current = versions.find((v) => v.current) ?? versions[0];
    if (current) setOpen(new Set([current.id]));
    setSeeded(true);
  }, [versions, seeded]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Display order: newest first. `versions` is oldest-first from the API.
  const ordered = useMemo(() => [...versions].reverse(), [versions]);
  const previousOf = (v: Version) =>
    versions.find((p) => p.number === v.number - 1) ?? null;

  return (
    <Card size="sm" className={className} id="prompt-versions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Prompt versions
          {versions.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {versions.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-1">
        {skeleton ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !query.isLoading && versions.length === 0 ? (
          <EmptyState
            icon={IconVersions}
            title="No prompt versions yet"
            description="Versions are read off the system prompts your runs record."
            className="border-none"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {ordered.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                previous={previousOf(v)}
                agentName={agentName}
                open={open.has(v.id)}
                onToggle={() => toggle(v.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function VersionRow({
  version: v,
  previous,
  agentName,
  open,
  onToggle,
}: {
  version: Version;
  previous: Version | null;
  agentName: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const tracesHref = `/traces?agent=${encodeURIComponent(agentName)}&prompt=${encodeURIComponent(v.id)}`;
  return (
    <li className="flex flex-col py-2 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md py-1.5 text-left text-xs transition-colors hover:text-foreground"
      >
        <IconChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <Badge variant="outline" className="font-mono tabular-nums">
          v{v.number}
        </Badge>
        {v.current && <Badge variant="green">current</Badge>}
        <span
          className="text-muted-foreground"
          title={`First seen ${formatDateTime(v.firstSeen)}`}
        >
          since <RelativeTime value={v.firstSeen} />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-muted-foreground tabular-nums">
          {v.slotCount > 0 && (
            <span title="Stretches of the prompt that change between runs">
              {v.slotCount} {v.slotCount === 1 ? "slot" : "slots"}
            </span>
          )}
          {v.hashCount > 1 && (
            <span title="Distinct prompt texts folded into this version">
              {formatCount(v.hashCount)} variants
            </span>
          )}
          <span title={`Last seen ${formatDateTime(v.lastSeen)}`}>
            {formatCount(v.runCount)} {v.runCount === 1 ? "run" : "runs"}
          </span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 pb-1 pl-[22px]">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className={DRAWER_BUTTON_CLASS}
              // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
              render={<Link href={tracesHref as any} />}
            >
              View traces
              <IconArrowUpRight className="mt-px" />
            </Button>
            {previous && (
              <Button
                size="sm"
                variant="secondary"
                className={DRAWER_BUTTON_CLASS}
                onClick={() => setShowDiff((d) => !d)}
              >
                {showDiff ? "Hide diff" : `Diff vs v${previous.number}`}
              </Button>
            )}
            <span className="ml-auto">
              <CopyButton value={v.template} title="Copy template" />
            </span>
          </div>
          {showDiff && previous ? (
            <TemplateDiff from={previous.template} to={v.template} />
          ) : (
            <Template text={v.template} />
          )}
        </div>
      )}
    </li>
  );
}

const TEMPLATE_CLASS =
  "max-h-[420px] overflow-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-anywhere";

function SlotLine() {
  return (
    <span
      className="italic text-muted-foreground"
      title="Content that changes between runs"
    >
      {SLOT_LINE} varies per run
    </span>
  );
}

function Template({ text }: { text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  return (
    <div className={TEMPLATE_CLASS}>
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list
        <div key={i} className="min-h-[1.2em]">
          {line === SLOT_LINE ? <SlotLine /> : line}
        </div>
      ))}
    </div>
  );
}

function TemplateDiff({ from, to }: { from: string; to: string }) {
  const ops = useMemo<DiffOp[]>(() => lineDiff(from, to), [from, to]);
  return (
    <div className={cn(TEMPLATE_CLASS, "px-0")}>
      {ops.map((op, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          key={i}
          className={cn(
            "flex min-h-[1.2em] gap-2 px-3",
            op.type === "add" &&
              "bg-green-500/10 text-green-800 dark:text-green-300",
            op.type === "del" &&
              "bg-rose-500/10 text-rose-800 dark:text-rose-300"
          )}
        >
          <span className="w-2 shrink-0 select-none text-muted-foreground/70">
            {op.type === "add" ? "+" : op.type === "del" ? "−" : " "}
          </span>
          <span className="min-w-0 flex-1">
            {op.line === SLOT_LINE ? <SlotLine /> : op.line}
          </span>
        </div>
      ))}
    </div>
  );
}
