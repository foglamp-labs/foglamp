"use client";

import type { DetectedPlan, PlanStatus } from "@foglamp/contracts/instrumentation";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { Spinner } from "@foglamp/ui/components/spinner";
import { cn } from "@foglamp/ui/lib/utils";
import { IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

// The one card that runs the whole show: what Foglamp found, the approve /
// reject actions, and — once the user has clicked — a compact live status line
// in the same spot. Merging these means the page has exactly one place to
// look, and the button row turning into "Agent is applying…" right where the
// user just clicked is the clearest possible feedback that the loop is live.

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4 agents, 2 workflows, 1 conversation flow, and 13 model calls" */
function phrase(parts: string[]): string {
  if (parts.length === 0) return "nothing to instrument yet";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

type Tone = "working" | "done" | "stopped";

// One line each — the headline above already carries the context.
const STATUS_LINE: Record<Exclude<PlanStatus, "awaiting_approval">, { text: string; tone: Tone }> = {
  approved: { text: "Approved — your agent picks this up in a few seconds.", tone: "working" },
  applying: { text: "Agent is applying your plan.", tone: "working" },
  applied: {
    text: "Instrumentation is in. Trigger one of your real AI flows and the first trace lands here.",
    tone: "working",
  },
  verified: { text: "Verified — your first trace landed.", tone: "done" },
  rejected: { text: "Rejected. Nothing was changed in your repo.", tone: "stopped" },
  expired: { text: "This plan expired. Run the setup prompt again for a fresh one.", tone: "stopped" },
  failed: { text: "Your agent couldn't finish — check its output, then run the prompt again.", tone: "stopped" },
};

const TONE_TEXT: Record<Tone, string> = {
  working: "text-muted-foreground",
  done: "text-emerald-600 dark:text-emerald-400",
  stopped: "text-amber-600 dark:text-amber-400",
};

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === "done") return <IconCheck className="size-4 shrink-0" stroke={2.5} />;
  if (tone === "stopped") return <IconExclamationCircle className="size-4 shrink-0" />;
  // The shared `Spinner` is an unconditional `animate-spin`, so the reduced-
  // motion opt-out has to be applied here.
  return <Spinner className="size-4 shrink-0 motion-reduce:animate-none" />;
}

export function SetupSummary({
  plan,
  status,
  firstTraceId,
  failureStage,
  onApprove,
  onReject,
  approving,
}: {
  plan: DetectedPlan;
  status: PlanStatus;
  firstTraceId?: string | null;
  failureStage?: string | null;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const parts: string[] = [];
  const { agents, workflows, sessions } = plan.decisions;
  if (agents.length) parts.push(plural(agents.length, "agent"));
  if (workflows.length) parts.push(plural(workflows.length, "workflow"));
  if (sessions.length) parts.push(plural(sessions.length, "conversation flow"));
  if (plan.calls.length) parts.push(plural(plan.calls.length, "model call"));

  return (
    <Card className="rounded-[28px] squircle:rounded-[28px] py-0">
      <CardContent className="px-5 py-4">
        <h1 className="font-display text-base leading-snug font-semibold tracking-tight">
          Foglamp found {phrase(parts)}.
        </h1>
        {status === "awaiting_approval" ? (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={onApprove} disabled={approving}>
              {approving ? "Approving…" : "Approve and instrument"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} disabled={approving}>
              Reject
            </Button>
          </div>
        ) : (
          <div className={cn("mt-3 flex items-start gap-2", TONE_TEXT[STATUS_LINE[status].tone])}>
            <StatusIcon tone={STATUS_LINE[status].tone} />
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-relaxed">
                {STATUS_LINE[status].text}
                {status === "failed" && failureStage
                  ? ` It stopped while trying to ${failureStage} the plan.`
                  : null}
              </p>
              {status === "verified" && firstTraceId ? (
                <Button
                  size="sm"
                  className="w-fit"
                  render={
                    <Link href={`/traces/${encodeURIComponent(firstTraceId)}` as Route} />
                  }
                >
                  View your first trace
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
