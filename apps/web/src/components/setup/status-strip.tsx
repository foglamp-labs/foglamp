"use client";

import type { PlanStatus } from "@foglamp/contracts/instrumentation";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { Spinner } from "@foglamp/ui/components/spinner";
import { cn } from "@foglamp/ui/lib/utils";
import { IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

// The live half of the review page: where the setup is right now, in the
// user's language. Deliberately free of internal vocabulary — no "state",
// no "polling", no "payload". The user sees a conversation with their agent.

type Tone = "waiting" | "working" | "done" | "stopped";

const COPY: Record<PlanStatus, { title: string; body: string; tone: Tone }> = {
  awaiting_approval: {
    title: "Waiting for your coding agent",
    body: "Your agent is holding while you review. Approve the plan and it will pick up where it left off — you don't need to message it again.",
    tone: "waiting",
  },
  approved: {
    title: "Handing off to your coding agent",
    body: "Approved. Your agent should start applying this within a few seconds.",
    tone: "working",
  },
  applying: {
    title: "Agent is applying your plan",
    body: "Your coding agent is wiring up tracing across the calls you approved.",
    tone: "working",
  },
  applied: {
    title: "Waiting for your first real trace",
    body: "Instrumentation is in. Run one of your app's real AI flows and it will show up here — no demo calls needed.",
    tone: "working",
  },
  verified: {
    title: "Instrumentation verified",
    body: "Your first trace landed. Foglamp is live on this project.",
    tone: "done",
  },
  rejected: {
    title: "Plan rejected",
    body: "Nothing was changed in your repo. Ask your coding agent to scan again when you're ready.",
    tone: "stopped",
  },
  expired: {
    title: "This plan expired",
    body: "Plans are only good for 24 hours. Run the setup prompt again to get a fresh one.",
    tone: "stopped",
  },
  failed: {
    title: "Your agent couldn't finish",
    body: "Something stopped the agent partway through. Check its output, then run the setup prompt again.",
    tone: "stopped",
  },
};

const TONE_STYLE: Record<Tone, string> = {
  waiting: "text-muted-foreground",
  working: "text-muted-foreground",
  done: "text-emerald-600 dark:text-emerald-400",
  stopped: "text-amber-600 dark:text-amber-400",
};

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === "done") return <IconCheck className="size-4" stroke={2.5} />;
  if (tone === "stopped") return <IconExclamationCircle className="size-4" />;
  // The shared `Spinner` is an unconditional `animate-spin`, so the reduced-
  // motion opt-out has to be applied here. The title/body carry the state on
  // their own — the spin is decoration, and freezing it loses nothing.
  return <Spinner className="size-4 motion-reduce:animate-none" />;
}

export function StatusStrip({
  status,
  firstTraceId,
  spanCount,
  secondsToFirstTrace,
  failureStage,
  filesChanged,
  onApprove,
  onReject,
  approving,
}: {
  status: PlanStatus;
  firstTraceId?: string | null;
  spanCount?: number | null;
  secondsToFirstTrace?: number | null;
  failureStage?: string | null;
  filesChanged?: number;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const copy = COPY[status];

  return (
    <Card className="rounded-[28px] squircle:rounded-[28px]">
      <CardContent className="px-5 py-4">
        <div className={cn("flex items-center gap-2", TONE_STYLE[copy.tone])}>
          <StatusIcon tone={copy.tone} />
          <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {copy.body}
          {status === "failed" && failureStage
            ? ` It stopped while trying to ${failureStage} the plan.`
            : null}
        </p>

        {status === "applied" && filesChanged ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {filesChanged} file{filesChanged === 1 ? "" : "s"} changed.
          </p>
        ) : null}

        {status === "verified" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[11px] text-muted-foreground">
              {spanCount ? `${spanCount} spans` : "First trace"}
              {secondsToFirstTrace !== null && secondsToFirstTrace !== undefined
                ? ` · ${formatDuration(secondsToFirstTrace)} from plan to first trace`
                : null}
            </p>
            {firstTraceId ? (
              <Button
                size="sm"
                className="w-fit"
                render={
                  <Link
                    href={
                      `/traces/${encodeURIComponent(firstTraceId)}` as Route
                    }
                  />
                }
              >
                View your first trace
              </Button>
            ) : null}
          </div>
        ) : null}

        {status === "awaiting_approval" ? (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" onClick={onApprove} disabled={approving}>
              {approving ? "Approving…" : "Approve and instrument"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} disabled={approving}>
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
