"use client";

import { SLOT_LINE } from "@foglamp/prompts";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@foglamp/ui/components/hover-card";
import { IconFileHorizontalFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";

import { useProject } from "@/components/app/project-context";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

// A prompt template rendered as the document it is, not as source: headings,
// lists and paragraphs in the reading face, the normalizer's placeholders
// ({date}, {id}, …) as quiet tokens, and each `{…}` slot as a chip that shows
// what runs actually put there. Deliberately not a markdown engine — prompts
// lean on <tags> and literal text that a real parser would swallow, so every
// line the parser doesn't recognise is shown as-is.

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "tag"; text: string }
  | { type: "rule" }
  | { type: "slot"; index: number };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
// Numbers are normalized to {n}, so "1. Rule" reaches us as "{n}. Rule".
const ORDERED = /^(?:\d+|\{n\})[.)]\s+(.*)$/;
const TAG = /^<\/?[A-Za-z_][\w:-]*(?:\s[^<>]*)?>$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

function isSpecial(line: string): boolean {
  return (
    line === "" ||
    line === SLOT_LINE ||
    HEADING.test(line) ||
    RULE.test(line) ||
    TAG.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

export function parsePrompt(template: string): Block[] {
  const blocks: Block[] = [];
  const lines = template.split("\n");
  let slots = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line === "") {
      i++;
      continue;
    }
    if (line === SLOT_LINE) {
      blocks.push({ type: "slot", index: slots++ });
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: (heading[1] as string).length,
        text: heading[2] as string,
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (TAG.test(line)) {
      blocks.push({ type: "tag", text: line });
      i++;
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const re = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const item = re.exec(lines[i] as string);
        if (!item) break;
        items.push(item[1] as string);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isSpecial(lines[i] as string)) {
      para.push(lines[i] as string);
      i++;
    }
    blocks.push({ type: "paragraph", lines: para });
  }
  return blocks;
}

// --- inline -----------------------------------------------------------------

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\{(?:date|time|id|email|url|n)\})/g;

const PLACEHOLDER_TITLE: Record<string, string> = {
  date: "A date — differs per run, so it isn't part of the version",
  time: "A clock time — differs per run, so it isn't part of the version",
  id: "An identifier — differs per run, so it isn't part of the version",
  email: "An email address — differs per run, so it isn't part of the version",
  url: "A URL — differs per run, so it isn't part of the version",
  n: "A number — differs per run, so it isn't part of the version",
};

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        // split() with one capture group: matches sit at the odd indices.
        const key = `${i}:${part}`;
        if (i % 2 === 0) return <Fragment key={key}>{part}</Fragment>;
        if (part.startsWith("**")) {
          return (
            <strong key={key} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`")) {
          return (
            <code
              key={key}
              className="rounded bg-muted px-1 py-px font-mono text-[0.85em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const name = part.slice(1, -1);
        return (
          <span
            key={key}
            className="rounded bg-muted px-1 py-px font-mono text-[0.8em] text-muted-foreground"
            title={PLACEHOLDER_TITLE[name]}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

// --- slots ------------------------------------------------------------------

type SlotExample = { value: string; runs: number };

/** What a version's slots hold in practice; fetched once per version. */
export function useSlotExamples(versionId: string, slotCount: number) {
  const { projectId } = useProject();
  return useQuery({
    ...trpc.agents.promptSlotExamples.queryOptions({
      projectId: projectId!,
      versionId,
    }),
    enabled: !!projectId && slotCount > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function SlotChip({
  index,
  count,
  examples,
  loading,
}: {
  index: number;
  count: number;
  examples: SlotExample[] | undefined;
  loading: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={200}
        render={<button type="button" />}
        className="inline-flex cursor-default items-center gap-1 rounded-md bg-lime-400 px-1.5 py-0.5 text-[11px] font-medium text-lime-950 transition-colors hover:bg-lime-300 dark:bg-lime-600 dark:hover:bg-lime-500"
      >
        <IconFileHorizontalFilled className="size-3 text-lime-950/70" />
        varies per run
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Slot {index + 1} of {count} · what runs put here
        </div>
        {loading ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground">
            Loading examples…
          </div>
        ) : !examples || examples.length === 0 ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground">
            No example could be read for this slot yet.
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-border/40 overflow-auto">
            {examples.map((e) => (
              <li key={e.value} className="px-3 py-2">
                <div className="mb-1 text-[10px] tabular-nums text-muted-foreground">
                  {formatCount(e.runs)} {e.runs === 1 ? "run" : "runs"}
                </div>
                <div className="line-clamp-6 font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-anywhere">
                  {e.value === "" ? (
                    <span className="italic text-muted-foreground">
                      nothing — the line is absent in these runs
                    </span>
                  ) : (
                    e.value
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// --- document ---------------------------------------------------------------

export function PromptProse({
  template,
  versionId,
  slotCount,
  className,
}: {
  template: string;
  versionId: string;
  slotCount: number;
  className?: string;
}) {
  const blocks = useMemo(() => parsePrompt(template), [template]);
  const examples = useSlotExamples(versionId, slotCount);
  return (
    <div className={cn("flex flex-col gap-2.5 text-[13px] leading-relaxed", className)}>
      {blocks.map((b, i) => {
        // The block list is static per template, so position is a fine key.
        const key = `${i}:${b.type}`;
        switch (b.type) {
          case "heading":
            return (
              <div
                key={key}
                className={cn(
                  "font-semibold text-balance",
                  b.level <= 2 ? "mt-1 text-sm" : "text-[13px]",
                )}
              >
                <Inline text={b.text} />
              </div>
            );
          case "paragraph":
            return (
              <p key={key}>
                {b.lines.map((line, j) => (
                  <Fragment key={`${j}:${line}`}>
                    {j > 0 && <br />}
                    <Inline text={line} />
                  </Fragment>
                ))}
              </p>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag
                key={key}
                className={cn(
                  "space-y-0.5 pl-5 marker:text-muted-foreground/70",
                  b.ordered ? "list-decimal" : "list-disc",
                )}
              >
                {b.items.map((item, j) => (
                  <li key={`${j}:${item}`} className="pl-0.5">
                    <Inline text={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "tag":
            return (
              <div key={key} className="font-mono text-[11px] text-muted-foreground">
                {b.text}
              </div>
            );
          case "rule":
            return <hr key={key} className="border-border/60" />;
          case "slot":
            return (
              <div key={key}>
                <SlotChip
                  index={b.index}
                  count={slotCount}
                  examples={examples.data?.slots[b.index]?.examples}
                  loading={examples.isLoading}
                />
              </div>
            );
        }
      })}
    </div>
  );
}

/** Rough token count from length — about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
