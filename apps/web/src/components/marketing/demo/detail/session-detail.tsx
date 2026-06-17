"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconBoltFilled,
  IconCirclesFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhostFilled,
  IconSitemapFilled,
  IconUserFilled,
} from "@tabler/icons-react";

import { useRef } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { HEAT_SHADES } from "@/components/app/heat-cell";
import { navItem } from "@/components/app/nav";
import { StatCard } from "@/components/app/page-parts";
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatDuration,
  formatTokens,
} from "@/lib/format";
import { toMs } from "@/lib/trace-timeline";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
  quintiles,
  SESSIONS,
  SESSION_TURNS,
  type SessionTurn,
} from "../mock-data";

// Traffic-light shade for `cost` against the session's quintile `thresholds`.
// Mirrors the real session detail's local costShade.
function costShade(cost: number, thresholds: number[]) {
  if (!cost || cost <= 0 || thresholds.length === 0) return undefined;
  let i = 0;
  for (const t of thresholds) if (cost > t) i += 1;
  return HEAT_SHADES[Math.min(i, HEAT_SHADES.length - 1)];
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const { closeDetail, openDetail } = useDemo();
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const session = SESSIONS.find((s) => s.sessionId === sessionId) ?? SESSIONS[0]!;
  const sessionsNav = navItem("/sessions")!;

  // Scrolls within the demo's inset scroll container (not the page).
  const scrollToTurn = (i: number) =>
    turnRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The detail always renders the one fleshed-out conversation; derive the
  // stat strip from those turns so the numbers stay internally consistent.
  const turns = SESSION_TURNS;
  const costThresholds = quintiles(turns.map((t) => t.totalCost));
  const totalTokens = turns.reduce((n, t) => n + t.totalTokens, 0);
  const totalCost = turns.reduce((n, t) => n + t.totalCost, 0);
  const errorCount = turns.filter((t) => t.status === "error").length;
  const last = turns[turns.length - 1]!;
  const durationMs =
    toMs(last.startTime) + last.durationMs - toMs(turns[0]!.startTime);

  return (
    <>
      <DetailHeader
        backIcon={sessionsNav.icon}
        backLabel="Sessions"
        backIconClassName={sessionsNav.iconClassName}
        title={session.sessionId}
        description={`${session.user} · ${session.agentName}`}
        onBack={closeDetail}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-violet-300 dark:text-violet-700"
          size="sm"
          label="Turns"
          value={formatCount(turns.length)}
        />
        <StatCard
          icon={IconCirclesFilled}
          iconClassName="text-blue-400 dark:text-blue-600"
          size="sm"
          label="Tokens"
          value={formatTokens(totalTokens)}
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-300 dark:text-sky-700"
          size="sm"
          label="Duration"
          value={
            <span className="flex items-baseline gap-1.5">
              {formatDuration(durationMs)}
              <span className="text-xs font-normal text-muted-foreground">
                started {session.when}
              </span>
            </span>
          }
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-300 dark:text-yellow-600"
          size="sm"
          label="Cost"
          value={formatCost(totalCost, 4)}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)] mt-4">
        {/* Turn navigation rail — jump within long conversations. */}
        <nav className="hidden lg:block">
          <div className="sticky top-4 flex flex-col gap-0.5">
            {errorCount > 0 && (
              <Badge variant="rose" className="mb-2 self-start font-sans ml-1">
                <IconAlertTriangle />
                {formatCount(errorCount)}
                {errorCount === 1 ? " error" : " errors"}
              </Badge>
            )}
            <button
              type="button"
              onClick={() =>
                openDetail({ type: "agent", id: session.agentName })
              }
              className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <AgentIcon name={session.agentName} className="size-3.5" />
              <span className="truncate font-medium">{session.agentName}</span>
            </button>
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
                <span className="font-medium tabular-nums">Turn {i + 1}</span>
                {t.status === "error" && (
                  <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />
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
              <TurnBlock turn={t} index={i} costThresholds={costThresholds} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TurnBlock({
  turn,
  index,
  costThresholds,
}: {
  turn: SessionTurn;
  index: number;
  costThresholds: number[];
}) {
  const { openDetail } = useDemo();
  const isError = turn.status === "error";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-l-2 pl-4",
        isError ? "border-rose-500" : "border-transparent",
      )}
    >
      {/* Turn header: index, time, cost, tokens, duration, and a trace link. */}
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
          <button
            type="button"
            onClick={() =>
              openDetail({ type: "workflow", id: turn.workflowName! })
            }
            className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-full border bg-card/40 px-2 py-0.5 transition-colors hover:text-foreground"
          >
            <IconSitemapFilled className="size-3 shrink-0 text-emerald-500" />
            <span className="truncate max-w-40">{turn.workflowName}</span>
          </button>
        )}
        {isError && (
          <Badge variant="rose">
            <IconAlertTriangle />
            Error
          </Badge>
        )}
        <button
          type="button"
          onClick={() => openDetail({ type: "trace", id: turn.traceId })}
          className="ml-2 inline-flex cursor-pointer items-center gap-0.5 transition-colors hover:text-foreground"
        >
          Trace
          <IconArrowUpRight className="size-3.5" />
        </button>
      </div>

      <Bubble role="user" text={turn.userMessage} />
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
}: {
  role: "user" | "assistant";
  text: string;
}) {
  const isUser = role === "user";
  const Icon = isUser ? IconUserFilled : IconGhostFilled;
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-(--custom-shadow)",
          isUser && "mt-1.5",
        )}
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
        <p
          className={cn(
            "wrap-break-word text-sm",
            isUser ? "whitespace-pre-wrap" : "leading-relaxed",
          )}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
