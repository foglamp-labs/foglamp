"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconGhostFilled,
  IconMessageOff,
  IconPlayerStopFilled,
  IconSitemapFilled,
  IconTool,
  IconUserFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { Streamdown } from "streamdown";

import { AgentIcon } from "@/components/app/agent-icon";
import { CopyButton } from "@/components/app/copy-button";
import { Chip, ContextChip } from "@/components/app/context-chip";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { HEAT_SHADES } from "@/components/app/heat-cell";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { markdownComponents } from "@/components/app/markdown";
import { ModelChip } from "@/components/app/model-chip";
import { navItem } from "@/components/app/nav";
import { EmptyState, NoProject, PageHeader } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { RelativeTime } from "@/components/app/relative-time";
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatDuration,
  formatSpanDuration,
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
  toolCalls: { name: string; count: number; errorCount: number }[];
};

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
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const detail = useQuery({
    ...trpc.sessions.get.queryOptions({ projectId: projectId!, sessionId }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(detail.isLoading);
  // Latch for the entrance fade: whatever paints first below the header
  // (skeleton or the loaded content) gets the fade, and the swap between them
  // stays instant (see useSkeletonShown).
  const skeletonShown = useSkeletonShown(showSkeleton);

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
      {/* Wrapped here (not inside loading.tsx's RouteHeader fallback) so that
          fallback's copy stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <PageHeader
          title={sessionId}
          back={back}
          titleTrailing={
            <CopyButton value={sessionId} title="Copy session ID" />
          }
        />
      </div>

      {/* Chip-shaped placeholders where the context chips will land, so the
          layout below doesn't shift when they arrive. */}
      {detail.isLoading && showSkeleton && (
        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-2 px-7",
            entrance && "page-fade-in",
          )}
        >
          {/* Plain divs, not <Skeleton> — its base corner-squircle squares off
              rounded-full, and these must read as the pills they stand in for. */}
          <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-36 animate-pulse rounded-full bg-muted" />
        </div>
      )}

      {/* Context chips: the customer this session served and the agent that
				    ran it — same linked-entity pills as the trace detail page. */}
      {(data?.customer || data?.agentName || data?.models.length) && (
        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-2 text-xs px-7",
            entrance && !skeletonShown && "page-fade-in",
          )}
        >
          {data.customer && (
            <ContextChip
              href={`/traces?customer=${encodeURIComponent(
                data.customer.customerId,
              )}`}
              icon={(p) => (
                <CustomerAvatar
                  customerId={data.customer!.customerId}
                  customerName={data.customer!.customerName}
                  imageUrl={data.customer!.customerImageUrl}
                  filled
                  className={p.className}
                />
              )}
              iconClassName=""
              label={data.customer.customerName ?? data.customer.customerId}
            />
          )}
          {data.agentName && (
            <ContextChip
              href={`/agents/${encodeURIComponent(data.agentName)}`}
              icon={(p) => (
                <AgentIcon
                  name={data.agentName}
                  filled
                  className={p.className}
                />
              )}
              iconClassName=""
              label={data.agentName}
            />
          )}
          <ModelChip models={data.models} />
        </div>
      )}

      {detail.isLoading ? (
        showSkeleton ? (
          <div className={cn(entrance && "page-fade-in")}>
            <SessionDetailSkeleton />
          </div>
        ) : null
      ) : turns.length === 0 ? (
        <div
          className={cn(entrance && !skeletonShown && "page-fade-in", "px-8")}
        >
          <EmptyState
            icon={IconMessageOff}
            title="No turns in this session"
            description="It may have aged out of retention."
          />
        </div>
      ) : (
        // Mirrors the shell's `flex flex-col gap-6` — this wrapper replaced a
        // fragment, so it has to reproduce the spacing its children used to
        // get as direct flex children of the shell.
        <div
          className={cn(
            "flex flex-col gap-6 mt-1",
            entrance && !skeletonShown && "page-fade-in",
          )}
        >
          <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)] mt-2 px-8">
            {/* The rail is hidden below lg, so the stats need a home there —
                a horizontal row above the turns. `hidden` keeps it out of the
                lg grid (display:none elements aren't grid items). */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 lg:hidden">
              <SessionStats stats={stats} durationMs={durationMs} />
            </div>

            {/* Turn navigation rail — session facts on top (same label-over-
                value fields as the trace sheet, in place of the old stat
                cards), then jump-to-turn within long conversations. */}
            <nav className="hidden lg:block">
              <div className="sticky top-8 flex max-h-[calc(100svh-4rem)] flex-col gap-0.5">
                <div className="mb-3 flex flex-col gap-3 border-b border-border/40 px-2 pb-4">
                  <SessionStats stats={stats} durationMs={durationMs} />
                </div>
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
                <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
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
                      {t.status === "aborted" && (
                        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                      )}
                      <span
                        className={cn(
                          "ml-auto tabular-nums",
                          costShade(t.totalCost, costThresholds) ??
                            "text-muted-foreground",
                        )}
                      >
                        {formatCost(t.totalCost)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>

            <div className="flex flex-col gap-8">
              {turns.map((t, i) => (
                <div
                  key={t.traceId}
                  ref={(el) => {
                    turnRefs.current[i] = el;
                  }}
                  className="scroll-mt-8"
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
        </div>
      )}
    </>
  );
}

/** The session's headline numbers as label-over-value fields (the trace
 * sheet's Field styling) — rendered vertically in the turn rail on lg+, and as
 * a wrapping horizontal row above the turns below that. Layout comes from the
 * parent container, which is why this is a fragment. */
function SessionStats({
  stats,
  durationMs,
}: {
  stats: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number | null;
    firstSeen: string | null;
  } | null;
  durationMs: number | null;
}) {
  const inTok = stats?.inputTokens ?? 0;
  const outTok = stats?.outputTokens ?? 0;
  return (
    <>
      <SessionStat
        label="Started"
        value={
          stats?.firstSeen ? <RelativeTime value={stats.firstSeen} /> : "—"
        }
      />
      <SessionStat
        label="Duration"
        value={durationMs == null ? "—" : formatSpanDuration(durationMs)}
      />
      <SessionStat
        label="Tokens"
        value={
          // Split inline with the total (one line, like every other stat), so
          // the loaded value matches the skeleton's line box with zero shift.
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span>{formatTokens(stats?.totalTokens ?? 0)}</span>
            {(inTok > 0 || outTok > 0) && (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatTokens(inTok)} in · {formatTokens(outTok)} out
              </span>
            )}
          </span>
        }
      />
      <SessionStat
        label="Cost"
        value={stats?.totalCost != null ? formatCost(stats.totalCost, 4) : "—"}
      />
    </>
  );
}

function SessionStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px] tabular-nums">{value}</span>
    </div>
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
  const isAborted = turn.status === "aborted";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-l-2 pl-4",
        isError
          ? "border-rose-500"
          : isAborted
            ? "border-amber-500"
            : "border-transparent",
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
        <span>{formatSpanDuration(turn.durationMs)}</span>
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
        {isAborted && (
          <Badge variant="amber">
            <IconPlayerStopFilled />
            Aborted
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
      {turn.toolCalls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-9">
          {turn.toolCalls.map((tc) => (
            <Chip
              key={tc.name}
              href={`/traces/${encodeURIComponent(turn.traceId)}`}
              title={`View ${tc.name} in the trace`}
              tone={tc.errorCount > 0 ? "error" : "ok"}
              icon={
                <IconTool
                  className={cn(
                    "size-3 shrink-0 fill-current stroke-1 mb-px",
                    tc.errorCount > 0 ? "text-current" : "text-blue-500",
                  )}
                />
              }
              label={<span className="font-mono">{tc.name}</span>}
              trailing={tc.count > 1 ? `×${tc.count}` : undefined}
            />
          ))}
        </div>
      )}
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
        className={`${isUser && "mt-1.5"} flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground shadow-(--custom-shadow)`}
      >
        <Icon className="size-3.5" />
      </div>
      <div
        className={
          isUser
            ? "min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl bg-card dark:bg-muted-foreground/10 shadow-(--custom-shadow) px-3 py-2.5"
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

/**
 * Loading treatment shaped like the loaded page: the real rail structure with
 * the stat labels kept as-is (only the values are skeletons), placeholder
 * turn-nav rows, and a couple of conversation-turn skeletons on the right —
 * so nothing about the layout changes when the session lands.
 */
function SessionDetailSkeleton() {
  return (
    <div className="mt-3 grid gap-8 px-8 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="flex flex-wrap gap-x-8 gap-y-3 lg:hidden">
        <SessionStatsSkeleton />
      </div>
      <nav className="hidden lg:block">
        <div className="sticky top-8 flex flex-col gap-0.5">
          <div className="mb-3 flex flex-col gap-3 border-b border-border/40 px-2 pb-4">
            <SessionStatsSkeleton />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="ml-auto h-3 w-10" />
            </div>
          ))}
        </div>
      </nav>
      <div className="flex flex-col gap-8">
        <TurnSkeleton />
        <TurnSkeleton lines={2} />
      </div>
    </div>
  );
}

/** The four rail stats with real labels and skeleton values. */
function SessionStatsSkeleton() {
  return (
    <>
      {(
        [
          ["Started", "w-14"],
          ["Duration", "w-10"],
          ["Tokens", "w-12"],
          ["Cost", "w-14"],
        ] as const
      ).map(([label, w]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          {/* Sized to the value's line box (text-[13px] ≈ 20px) so the loaded
              value doesn't shift the rail when it replaces the blob. */}
          <span className="flex h-5 items-center">
            <Skeleton className={cn("h-3", w)} />
          </span>
        </div>
      ))}
    </>
  );
}

/** One conversation turn: header line, user bubble, assistant paragraph —
 * mirroring {@link TurnBlock}'s spacing (border-l-2 + pl-4 + avatar gutter). */
function TurnSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-4 border-l-2 border-transparent pl-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex gap-3">
        {/* Avatar circles are plain divs — <Skeleton>'s corner-squircle would
            square off rounded-full. */}
        <div className="mt-1.5 size-6 shrink-0 animate-pulse rounded-full bg-muted" />
        <Skeleton className="h-14 min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl" />
      </div>
      <div className="flex gap-3">
        <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pt-1">
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton
              key={i}
              className={cn(
                "h-3.5",
                i === lines - 1 ? "w-2/3" : i % 2 ? "w-11/12" : "w-full",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
