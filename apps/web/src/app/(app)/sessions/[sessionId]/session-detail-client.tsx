"use client";

import {
  IconArrowLeft,
  IconArrowUpRight,
  IconMessageOff,
  IconRobotFace,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import Link from "next/link";

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

  const back = (
    <Button variant="outline" size="sm" render={<Link href="/sessions" />}>
      <IconArrowLeft />
      Sessions
    </Button>
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title={sessionId} actions={back} />
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
        title={sessionId}
        description={
          data?.agentName
            ? `Conversation · ${data.agentName}`
            : "Conversation timeline"
        }
        actions={back}
      />

      {detail.isLoading ? (
        <TableSkeleton />
      ) : turns.length === 0 ? (
        <EmptyState
          icon={IconMessageOff}
          title="No turns in this session"
          description="It may have aged out of retention."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Turns" value={formatCount(stats?.turnCount ?? 0)} />
            <StatCard
              label="Tokens"
              value={formatTokens(stats?.totalTokens ?? 0)}
            />
            <StatCard label="Cost" value={formatCost(stats?.totalCost ?? null)} />
            <StatCard
              label="Started"
              value={formatRelative(stats?.firstSeen)}
              hint={
                (stats?.errorCount ?? 0) > 0
                  ? `${formatCount(stats?.errorCount ?? 0)} errors`
                  : undefined
              }
            />
          </div>

          <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-2">
      {/* Turn header: index, time, status, and a link to the full trace. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Turn {index + 1}</span>
        <span>·</span>
        <span>{formatDateTime(turn.startTime)}</span>
        {turn.workflowName && (
          <Badge variant="secondary" className="ml-1">
            {turn.workflowName}
          </Badge>
        )}
        {turn.status === "error" && <Badge variant="rose">error</Badge>}
        <Link
          href={`/traces/${encodeURIComponent(turn.traceId)}`}
          className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
        >
          trace
          <IconArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {turn.userMessage && (
        <Bubble role="user" text={turn.userMessage} raw={turn.rawInput} />
      )}
      {turn.assistantOutput ? (
        <Bubble role="assistant" text={turn.assistantOutput} />
      ) : (
        <p className="pl-8 text-sm text-muted-foreground italic">
          No output captured.
        </p>
      )}

      {/* Per-turn footer metrics. */}
      <div className="pl-8 text-xs text-muted-foreground tabular-nums">
        {formatCost(turn.totalCost)} · {formatTokens(turn.totalTokens)} tok ·{" "}
        {formatDuration(turn.durationMs)}
      </div>
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
  const Icon = isUser ? IconUser : IconRobotFace;
  // Show the raw input disclosure only when it carries more than the extracted message.
  const showRaw = isUser && raw && raw.trim() !== text.trim();
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div
        className={
          isUser
            ? "min-w-0 flex-1 rounded-lg bg-muted px-3 py-2"
            : "min-w-0 flex-1 rounded-lg border px-3 py-2"
        }
      >
        <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
        {showRaw && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              View full input
            </summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2">
              {raw}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
