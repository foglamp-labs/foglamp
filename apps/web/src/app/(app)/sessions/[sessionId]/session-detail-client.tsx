"use client";

import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconBoltFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhostFilled,
  IconMessageOff,
  IconSitemapFilled,
  IconStack2Filled,
  IconUserFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import Link from "next/link";
import { useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { AgentIcon } from "@/components/app/agent-icon";
import { CopyIcon } from "@/components/app/copy-icon";
import { useDelayedLoading } from "@/components/app/data-table";
import { markdownComponents } from "@/components/app/markdown";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatDuration,
  formatRelative,
  formatTokens,
} from "@/lib/format";
import { toMs } from "@/lib/trace-timeline";
import { trpc } from "@/utils/trpc";

type Turn = {
  traceId: string;
  agentName: string | null;
  workflowName: string | null;
  startTime: string;
  status: string;
  userMessage: string | null;
  assistantOutput: string | null;
  rawInput: string | null;
  totalCost: number | null;
  totalTokens: number;
  errorCount: number;
  durationMs: number;
};

// Per-turn cost heatmap, scoped to this session: tint each turn's cost by its
// percentile among the session's priced turns so the expensive turns pop. Light
// uses 600 / dark uses 400. Literal classes so Tailwind keeps them.
const HEAT_SHADES = [
  "text-green-600 dark:text-green-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-amber-600 dark:text-amber-400",
  "text-orange-600 dark:text-orange-400",
  "text-red-600 dark:text-red-400",
] as const;

/** 20/40/60/80th-percentile thresholds of the positive values (sorted-nearest). */
function quintiles(values: number[]): number[] {
  const xs = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => {
    const idx = Math.min(xs.length - 1, Math.floor(q * xs.length));
    return xs[idx];
  });
}

/** Traffic-light shade for `cost` against the session's quintile `thresholds`. */
function costShade(cost: number | null, thresholds: number[]) {
  if (!cost || cost <= 0 || thresholds.length === 0) return undefined;
  let i = 0;
  for (const t of thresholds) if (cost > t) i += 1;
  return HEAT_SHADES[Math.min(i, HEAT_SHADES.length - 1)];
}

export function SessionDetailClient({ sessionId }: { sessionId: string }) {
  const { projectId } = useProject();
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const detail = useQuery({
    ...trpc.sessions.get.queryOptions({ projectId: projectId!, sessionId }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(detail.isLoading);

  const back = navItem("/sessions");

  if (!projectId) {
    return (
      <>
        <PageHeader title={sessionId} back={back} />
        <NoProject />
      </>
    );
  }

  const data = detail.data;
  const stats = data?.stats ?? null;
  const turns = (data?.turns ?? []) as Turn[];
  const costThresholds = quintiles(turns.map((t) => t.totalCost ?? 0));

  // Session wall-clock duration (first turn start → last turn end). toMs, not
  // new Date(): these are ClickHouse space-separated UTC strings, which
  // new Date() rejects on Safari/Firefox and parses as local time on V8.
  const durationMs =
    stats?.firstSeen && stats?.lastSeen
      ? toMs(stats.lastSeen) - toMs(stats.firstSeen)
      : null;

  const scrollToTurn = (i: number) =>
    turnRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <PageHeader
        title={sessionId}
        back={back}
        titleTrailing={<CopyButton value={sessionId} title="Copy session ID" />}
      />

      {detail.isLoading ? (
        showSkeleton ? (
          <TableSkeleton />
        ) : null
      ) : turns.length === 0 ? (
        <EmptyState
          icon={IconMessageOff}
          title="No turns in this session"
          description="It may have aged out of retention."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-violet-300 dark:text-violet-700"
              size="sm"
              label="Turns"
              value={formatCount(stats?.turnCount ?? 0)}
            />
            <StatCard
              icon={IconStack2Filled}
              iconClassName="text-fuchsia-300 dark:text-fuchsia-700"
              size="sm"
              label="Tokens"
              value={formatTokens(stats?.totalTokens ?? 0)}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-300 dark:text-sky-700"
              size="sm"
              label="Duration"
              value={
                <span className="flex items-baseline gap-1.5">
                  {durationMs == null ? "—" : formatDuration(durationMs)}
                  {stats?.firstSeen && (
                    <span className="text-xs font-normal text-muted-foreground">
                      started {formatRelative(stats.firstSeen)}
                    </span>
                  )}
                </span>
              }
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-300 dark:text-yellow-600"
              size="sm"
              label="Cost"
              value={formatCost(stats?.totalCost ?? null)}
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)] mt-4">
            {/* Turn navigation rail — jump within long conversations. */}
            <nav className="hidden lg:block">
              <div className="sticky top-4 flex flex-col gap-0.5">
                {(stats?.errorCount ?? 0) > 0 && (
                  <Badge
                    variant="rose"
                    className="mb-2 self-start font-sans ml-1"
                  >
                    <IconAlertTriangle />
                    {formatCount(stats?.errorCount ?? 0)}
                    {(stats?.errorCount ?? 0) === 1 ? "error" : "errors"}
                  </Badge>
                )}
                {data?.agentName && (
                  <Link
                    // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
                    href={
                      `/agents/${encodeURIComponent(data.agentName)}` as any
                    }
                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <AgentIcon name={data.agentName} className="size-3.5" />
                    <span className="truncate font-medium">
                      {data.agentName}
                    </span>
                  </Link>
                )}
                <span className="px-2 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">
                  {turns.length} {turns.length === 1 ? "turn" : "turns"}
                </span>
                {turns.map((t, i) => (
                  <button
                    key={t.traceId}
                    type="button"
                    onClick={() => scrollToTurn(i)}
                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="font-medium tabular-nums">
                      Turn {i + 1}
                    </span>
                    {t.status === "error" && (
                      <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />
                    )}
                    <span
                      className={cn(
                        "ml-auto tabular-nums",
                        costShade(t.totalCost, costThresholds) ??
                          "text-muted-foreground"
                      )}
                    >
                      {formatCost(t.totalCost)}
                    </span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="flex flex-col gap-8">
              {turns.map((t, i) => (
                <div
                  key={t.traceId}
                  ref={(el) => {
                    turnRefs.current[i] = el;
                  }}
                  className="scroll-mt-4"
                >
                  <TurnBlock
                    turn={t}
                    index={i}
                    costThresholds={costThresholds}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TurnBlock({
  turn,
  index,
  costThresholds,
}: {
  turn: Turn;
  index: number;
  costThresholds: number[];
}) {
  const isError = turn.status === "error";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-l-2 pl-4",
        isError ? "border-rose-500" : "border-transparent"
      )}
    >
      {/* Turn header: index, time, status, and a link to the full trace. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          Turn {index + 1}
        </span>
        <span>·</span>
        <span>{formatDateTime(turn.startTime)}</span>
        <span>·</span>
        <span className={cn(costShade(turn.totalCost, costThresholds))}>
          {formatCost(turn.totalCost)}
        </span>
        <span>·</span>
        <span>{formatTokens(turn.totalTokens)} tokens</span>
        <span>·</span>
        <span>{formatDuration(turn.durationMs)}</span>
        {turn.workflowName && (
          <Link
            // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
            href={`/workflows/${encodeURIComponent(turn.workflowName)}` as any}
            className="ml-1 inline-flex items-center gap-1 rounded-full border bg-card/40 px-2 py-0.5 transition-colors hover:text-foreground"
          >
            <IconSitemapFilled className="size-3 shrink-0 text-emerald-500" />
            <span className="truncate max-w-40">{turn.workflowName}</span>
          </Link>
        )}
        {isError && (
          <Badge variant="rose">
            <IconAlertTriangle />
            Error
          </Badge>
        )}
        <Link
          href={`/traces/${encodeURIComponent(turn.traceId)}`}
          className="ml-2 inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          Trace
          <IconArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {turn.userMessage && <Bubble role="user" text={turn.userMessage} />}
      {turn.assistantOutput ? (
        <Bubble role="assistant" text={turn.assistantOutput} />
      ) : (
        <p className="pl-9 text-sm text-muted-foreground italic">
          No output captured.
        </p>
      )}
    </div>
  );
}

function Bubble({
  role,
  text,
  raw,
}: {
  role: "user" | "assistant";
  text: string;
  raw?: string | null;
}) {
  const isUser = role === "user";
  const Icon = isUser ? IconUserFilled : IconGhostFilled;
  // Show the raw input disclosure only when it carries more than the extracted message.
  const showRaw = isUser && raw && raw.trim() !== text.trim();
  return (
    <div className="group/bubble flex gap-3">
      <div
        className={`${isUser && "mt-1.5"} flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-(--custom-shadow)`}
      >
        <Icon className="size-3.5" />
      </div>
      <div
        className={
          isUser
            ? "min-w-0 flex-1 corner-squircle rounded-2xl bg-card dark:bg-muted-foreground/20 shadow-(--custom-shadow) px-3 py-2.5"
            : "min-w-0 flex-1 px-1 py-0"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{text}</p>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {/* Assistant output is markdown — render it (same prose spacing as Foggy). */}
            <div className="min-w-0 flex-1 text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child>*:first-child]:mt-0 [&>*:first-child>*:first-child>*:first-child]:mt-0">
              <Streamdown
                components={markdownComponents}
                controls={{ table: false }}
              >
                {text}
              </Streamdown>
            </div>
            <div className="shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100">
              <CopyButton value={text} title="Copy output" />
            </div>
          </div>
        )}
        {showRaw && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              View full input
            </summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap wrap-break-word rounded bg-background/60 p-2">
              {raw}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** Copy a string to the clipboard, with a brief check-mark confirmation. */
function CopyButton({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/60 cursor-pointer transition-colors hover:text-foreground"
    >
      <CopyIcon
        copied={copied}
        className="size-4"
        checkClassName="size-4 text-green-600 dark:text-green-400"
      />
    </button>
  );
}
