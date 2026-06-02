"use client";

import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconGhost2Filled,
  IconGhostFilled,
  IconMessageOff,
  IconRobotFace,
  IconRobotOff,
  IconUser,
  IconUserFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import Link from "next/link";
import { Streamdown } from "streamdown";

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

export function SessionDetailClient({ sessionId }: { sessionId: string }) {
  const { projectId } = useProject();

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

  return (
    <>
      <PageHeader
        title={`${sessionId} ${data?.agentName && `(${data.agentName})`}`}
        back={back}
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
              size="sm"
              label="Turns"
              value={formatCount(stats?.turnCount ?? 0)}
            />
            <StatCard
              size="sm"
              label="Tokens"
              value={formatTokens(stats?.totalTokens ?? 0)}
            />
            <StatCard
              size="sm"
              label="Cost"
              value={formatCost(stats?.totalCost ?? null)}
            />
            <StatCard
              size="sm"
              label="Started"
              value={formatRelative(stats?.firstSeen)}
              hint={
                (stats?.errorCount ?? 0) > 0
                  ? `${formatCount(stats?.errorCount ?? 0)} errors`
                  : undefined
              }
            />
          </div>

          <div className="flex flex-col gap-8">
            {turns.map((t, i) => (
              <TurnBlock key={t.traceId} turn={t} index={i} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function TurnBlock({ turn, index }: { turn: Turn; index: number }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Turn header: index, time, status, and a link to the full trace. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          Turn {index + 1}
        </span>
        <span>·</span>
        <span>{formatDateTime(turn.startTime)}</span>
        <span>·</span>
        <span>{formatCost(turn.totalCost)}</span>
        <span>·</span>
        <span>{formatTokens(turn.totalTokens)} tokens</span>
        <span>·</span>
        <span>{formatDuration(turn.durationMs)}</span>
        {turn.workflowName && (
          <Badge variant="secondary" className="ml-1">
            {turn.workflowName}
          </Badge>
        )}
        {turn.status === "error" && (
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
    <div className="flex gap-3">
      <div
        className={`${isUser && "mt-1.5"} flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-(--custom-shadow)`}
      >
        <Icon className="size-3.5" />
      </div>
      <div
        className={
          isUser
            ? "min-w-0 flex-1 corner-squircle rounded-2xl bg-muted shadow-(--custom-shadow) px-3 py-2.5"
            : "min-w-0 flex-1 px-1 py-0"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{text}</p>
        ) : (
          // Assistant output is markdown — render it (same prose spacing as Foggy).
          <div className="text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child>*:first-child]:mt-0 [&>*:first-child>*:first-child>*:first-child]:mt-0">
            <Streamdown
              components={markdownComponents}
              controls={{ table: false }}
            >
              {text}
            </Streamdown>
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
