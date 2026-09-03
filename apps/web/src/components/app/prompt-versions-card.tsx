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
import { IconFileHorizontalFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { useDelayedLoading } from "@/components/app/hooks";
import { EmptyState, ScrollFade } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { estimateTokens, PromptProse } from "@/components/app/prompt-prose";
import { RelativeTime } from "@/components/app/relative-time";
import { formatCount, formatDateTime, formatTokens } from "@/lib/format";
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
 * prompt job (see packages/prompts). Laid out like the tools card: a list of
 * versions (newest first) with run counts on the right, and the selected
 * version's template — or its diff against the previous version — beside it.
 * The current version is selected by default.
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

  // Display order: newest first. `versions` is oldest-first from the API.
  const ordered = useMemo(() => [...versions].reverse(), [versions]);
  // Share bars are scaled to the most-run version, like the tools card
  // scales to the most-called tool.
  const maxRuns = Math.max(1, ...versions.map((v) => v.runCount));

  // Selection: the current version on first load; clicks take over after.
  // Falls back to the newest if a re-inference drops the selected id.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (versions.length === 0) return;
    if (selectedId && versions.some((v) => v.id === selectedId)) return;
    const current = versions.find((v) => v.current) ?? ordered[0];
    if (current) setSelectedId(current.id);
  }, [versions, ordered, selectedId]);
  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const previous = selected
    ? (versions.find((p) => p.number === selected.number - 1) ?? null)
    : null;

  if (!query.isLoading && versions.length === 0) {
    return (
      <Card size="sm" className={className} id="prompt-versions">
        <CardHeader>
          <CardTitle>Prompt versions</CardTitle>
        </CardHeader>
        <CardContent className="mt-1">
          <EmptyState
            icon={IconFileHorizontalFilled}
            title="No prompt versions yet"
            description="Versions are read off the system prompts your runs record."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className={className} id="prompt-versions">
      {/* Two columns from the top: the card's title belongs to the list
          column, and the template column runs its own header row (token
          estimate, Raw, Diff) at the same height. Traces for a version are
          reached from the traces page's prompt filter. */}
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Split from the template by a hairline like the date picker's
            preset column. */}
        <div className="lg:border-r-[0.5px] lg:border-solid lg:border-[#EFEFEF] lg:pr-6 lg:dark:border-[#252525]">
          <div className="flex h-7 items-center">
            <CardTitle>Prompt versions</CardTitle>
          </div>
          {/* One ScrollFade for both the skeleton and the loaded rows so the
              fade never remounts when the data lands (mirrors the tools
              card). The scroll container clips negative margins, so it is
              pulled out by the room the row highlight bleeds into (10px past
              the text, 2px above the first row's content). */}
          <ScrollFade
            className="-mx-2 mt-1.5 max-h-72 px-2"
            bottomFadeClassName="h-14 opacity-100"
          >
            {query.isLoading ? (
              <VersionRowsSkeleton skeleton={skeleton} />
            ) : (
              <div className="-mx-2 -mt-1 divide-y divide-border/40 pb-3">
                {ordered.map((v) => (
                  <VersionRow
                    key={v.id}
                    version={v}
                    selected={v.id === selectedId}
                    barWidth={Math.max(2, (v.runCount / maxRuns) * 100)}
                    onSelect={() => setSelectedId(v.id)}
                  />
                ))}
              </div>
            )}
          </ScrollFade>
        </div>
        {query.isLoading ? (
          <TemplateSkeleton skeleton={skeleton} />
        ) : selected ? (
          <TemplatePane version={selected} previous={previous} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function VersionRow({
  version: v,
  selected,
  barWidth,
  onSelect,
}: {
  version: Version;
  selected: boolean;
  barWidth: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      // The highlight is a pseudo-element inset from the row box so it clears
      // the dividers above and below instead of filling edge to edge.
      className={cn(
        "group/row relative isolate flex w-full cursor-pointer items-center justify-between gap-6 px-2.5 py-3 text-left",
        "before:absolute before:inset-x-0 before:top-0.5 before:bottom-1.5 before:-z-10 before:rounded-md before:transition-colors",
        selected ? "before:bg-muted" : "hover:before:bg-muted/50"
      )}
    >
      {/* Left: version + secondary facts (mirrors the tools card row). */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.75">
          <IconFileHorizontalFilled
            className={cn(
              "size-3.25 shrink-0 transition-colors",
              selected
                ? "text-orange-400 dark:text-orange-600"
                : "text-muted-foreground/50 group-hover/row:text-muted-foreground"
            )}
          />
          <span
            className={cn(
              "truncate text-sm font-medium tabular-nums transition-colors",
              !selected &&
                "text-muted-foreground group-hover/row:text-foreground"
            )}
          >
            v{v.number}
          </span>
        </div>
        <div className="mt-1 text-xs tabular-nums text-muted-foreground/70">
          {v.current && <span className="text-primary">Current · </span>}
          <span title={`First seen ${formatDateTime(v.firstSeen)}`}>
            since <RelativeTime value={v.firstSeen} />
          </span>
          {v.slotCount > 0 && (
            <span title="Stretches of the prompt that change between runs">
              {" "}
              · {v.slotCount} {v.slotCount === 1 ? "slot" : "slots"}
            </span>
          )}
          {v.hashCount > 1 && (
            <span title="Distinct prompt texts folded into this version">
              {" "}
              · {formatCount(v.hashCount)} variants
            </span>
          )}
        </div>
      </div>
      {/* Right: run count + share-of-runs bar. */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="text-sm tabular-nums"
          title={`Last seen ${formatDateTime(v.lastSeen)}`}
        >
          {formatCount(v.runCount)}
          {v.runCount === 1 ? " run" : " runs"}
        </span>
        <div className="h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
          <div
            className="ml-auto h-full rounded-full bg-orange-400 dark:bg-orange-600"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </button>
  );
}

/** The selected version's template — as prose by default, raw on request —
 * or its diff against the previous version. */
function TemplatePane({
  version: v,
  previous,
}: {
  version: Version;
  previous: Version | null;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [raw, setRaw] = useState(false);
  // A newly selected version opens on its template, not a stale diff toggle.
  useEffect(() => setShowDiff(false), [v.id]);
  const tokens = estimateTokens(v.template);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex h-7 items-center gap-2">
        <span
          className="text-xs text-muted-foreground tabular-nums"
          title="Estimated from the template's length, about four characters per token. Slot content adds to this."
        >
          ≈ {formatTokens(tokens)} tokens
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!showDiff && (
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={raw}
              className={cn(
                DRAWER_BUTTON_CLASS,
                raw && "bg-muted dark:bg-muted-foreground/25"
              )}
              onClick={() => setRaw((r) => !r)}
            >
              Raw
            </Button>
          )}
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
        </span>
      </div>
      {/* Pulled out by the diff's line-tint bleed so the scroll container
          doesn't clip it; the same fade treatment as the list. */}
      <ScrollFade
        className="-mx-1.5 max-h-72 px-1.5"
        bottomFadeClassName="h-20 opacity-100"
      >
        {showDiff && previous ? (
          <TemplateDiff from={previous.template} to={v.template} />
        ) : raw ? (
          <Template text={v.template} />
        ) : (
          <PromptProse
            template={v.template}
            versionId={v.id}
            slotCount={v.slotCount}
          />
        )}
      </ScrollFade>
    </div>
  );
}

// The template sits directly in the card, beside the list; no box of its own.
const TEMPLATE_CLASS =
  "font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-anywhere";

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
    <div className={cn(TEMPLATE_CLASS, "-mx-1.5")}>
      {ops.map((op, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          key={i}
          className={cn(
            "flex min-h-[1.2em] gap-2 rounded-sm px-1.5",
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

/** Row-shaped placeholder matching the loaded version rows. Invisible until
 * `skeleton` flips (see useDelayedLoading), like the tools card. */
function VersionRowsSkeleton({
  rows = 3,
  skeleton,
}: {
  rows?: number;
  skeleton: boolean;
}) {
  return (
    <div
      className={cn(
        "-mx-2 -mt-1 divide-y divide-border/40 pb-3",
        !skeleton && "invisible"
      )}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          key={i}
          className="flex items-center justify-between gap-6 px-2.5 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center gap-1.75">
              <Skeleton className="size-3.25 shrink-0 rounded-full squircle:rounded-full" />
              <Skeleton className="h-3.5 w-8" />
            </div>
            <div className="mt-1 flex h-4 items-center">
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="flex h-4 items-center">
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-0.5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateSkeleton({ skeleton }: { skeleton: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2.5", !skeleton && "invisible")}>
      <div className="flex h-7 items-center">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-7 w-12" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}
