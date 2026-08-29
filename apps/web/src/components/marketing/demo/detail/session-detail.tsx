"use client";

import { Chip } from "@/components/app/context-chip";
import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconGhostFilled,
  IconSitemapFilled,
  IconTool,
  IconUserFilled,
} from "@tabler/icons-react";
import { type ReactNode, useRef } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CopyButton } from "@/components/app/copy-button";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { HEAT_SHADES } from "@/components/app/heat-cell";
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";

import { DemoContextChip, DemoModelChip, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
  AGENTS,
  quintiles,
  SESSION_TURNS,
  SESSIONS,
  type SessionTurn,
} from "../mock-data";

/** Traffic-light shade for `cost` against the session's quintile `thresholds`. */
function costShade(cost: number | null, thresholds: number[]) {
  if (!cost || cost <= 0 || thresholds.length === 0) return undefined;
  let i = 0;
  for (const t of thresholds) if (cost > t) i += 1;
  return HEAT_SHADES[Math.min(i, HEAT_SHADES.length - 1)];
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const { closeDetail, openDetail } = useDemo();
  const session =
    SESSIONS.find((s) => s.sessionId === sessionId) ?? SESSIONS[0]!;
  const models = AGENTS.find((a) => a.name === session.agentName)?.models ?? [];
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const turns = SESSION_TURNS;
  const costThresholds = quintiles(turns.map((t) => t.totalCost));

  const totalTokens = turns.reduce((sum, t) => sum + t.totalTokens, 0);
  const totalCost = turns.reduce((sum, t) => sum + t.totalCost, 0);
  const errorCount = turns.filter((t) => t.status === "error").length;
  // Session wall-clock duration (first turn start → last turn end).
  const durationMs = 5 * 60 * 1000 + 12_000;

  const scrollToTurn = (i: number) =>
    turnRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <DetailHeader
        backHref="/sessions"
        title={session.sessionId}
        titleTrailing={
          <CopyButton value={session.sessionId} title="Copy session ID" />
        }
        onBack={closeDetail}
      />

      {/* Context chips: the customer this session served and the agent that
			    ran it — same linked-entity pills as the trace detail page. */}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs px-6">
        {session.customer && (
          <DemoContextChip
            icon={(p) => (
              <CustomerAvatar
                customerId={session.customer!}
                customerName={session.customer!}
                filled
                className={p.className}
              />
            )}
            label={session.customer}
          />
        )}
        <DemoContextChip
          icon={(p) => (
            <AgentIcon
              name={session.agentName}
              filled
              className={p.className}
            />
          )}
          label={session.agentName}
          onClick={() => openDetail({ type: "agent", id: session.agentName })}
        />
        <DemoModelChip models={models} />
      </div>

      <div className="flex flex-col gap-6 mt-1">
        <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)] mt-2 px-8">
          {/* The rail is hidden below lg, so the stats need a home there —
					    a horizontal row above the turns. */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 lg:hidden">
            <SessionStats
              totalTokens={totalTokens}
              totalCost={totalCost}
              durationMs={durationMs}
              when={session.when}
            />
          </div>

          {/* Turn navigation rail — session facts on top, then jump-to-turn
					    within long conversations. */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 flex max-h-[calc(100svh-4rem)] flex-col gap-0.5">
              <div className="mb-3 flex flex-col gap-3 border-b border-border/40 px-2 pb-4">
                <SessionStats
                  totalTokens={totalTokens}
                  totalCost={totalCost}
                  durationMs={durationMs}
                  when={session.when}
                />
              </div>
              {errorCount > 0 && (
                <Badge
                  variant="rose"
                  className="mb-2 self-start font-sans ml-1"
                >
                  <IconAlertTriangle />
                  {formatCount(errorCount)}
                  {errorCount === 1 ? "error" : "errors"}
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
                <TurnBlock turn={t} index={i} costThresholds={costThresholds} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** The session's headline numbers as label-over-value fields (the trace
 * sheet's Field styling). */
function SessionStats({
  totalTokens,
  totalCost,
  durationMs,
  when,
}: {
  totalTokens: number;
  totalCost: number;
  durationMs: number;
  when: string;
}) {
  const inTok = Math.round(totalTokens * 0.72);
  const outTok = totalTokens - inTok;
  return (
    <>
      <SessionStat label="Started" value={when} />
      <SessionStat label="Duration" value={formatSpanDuration(durationMs)} />
      <SessionStat
        label="Tokens"
        value={
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span>{formatTokens(totalTokens)}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {formatTokens(inTok)} in · {formatTokens(outTok)} out
            </span>
          </span>
        }
      />
      <SessionStat label="Cost" value={formatCost(totalCost, 4)} />
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
          className="ml-2 inline-flex cursor-pointer items-center gap-0.5 hover:text-foreground transition-colors"
        >
          Trace
          <IconArrowUpRight className="size-3.5" />
        </button>
      </div>

      <Bubble role="user" text={turn.userMessage} />
      {turn.toolCalls && turn.toolCalls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-9">
          {turn.toolCalls.map((tc) => (
            <Chip
              key={tc.name}
              onClick={() => openDetail({ type: "trace", id: turn.traceId })}
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

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  const Icon = isUser ? IconUserFilled : IconGhostFilled;
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
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
              <p className="my-1.5 first:mt-0 last:mb-0">{text}</p>
            </div>
            <div className="shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100">
              <CopyButton value={text} title="Copy output" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
