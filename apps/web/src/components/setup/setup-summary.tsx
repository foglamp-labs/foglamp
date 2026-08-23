"use client";

import type {
  DetectedPlan,
  PlanStatus,
} from "@foglamp/contracts/instrumentation";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { Spinner } from "@foglamp/ui/components/spinner";
import { cn } from "@foglamp/ui/lib/utils";
import { IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

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
const STATUS_LINE: Record<
  Exclude<PlanStatus, "awaiting_approval">,
  { text: string; tone: Tone }
> = {
  approved: {
    text: "Approved. Just wait for your agent to pick this up.",
    tone: "working",
  },
  applying: { text: "Agent is applying your plan.", tone: "working" },
  applied: {
    text: "Instrumentation is in. Trigger your AI flows and see the first trace.",
    tone: "working",
  },
  verified: { text: "Verified — your first trace landed.", tone: "done" },
  rejected: {
    text: "Rejected. Nothing was changed in your repo.",
    tone: "stopped",
  },
  expired: {
    text: "This plan expired. Run the setup prompt again for a fresh one.",
    tone: "stopped",
  },
  failed: {
    text: "Your agent couldn't finish. Check its output, then run the prompt again.",
    tone: "stopped",
  },
};

// The two "your agent might be gone" thresholds. A live wait loop picks an
// approval up in ~1 second, so a couple of minutes in `approved` means the
// agent almost certainly stopped waiting (its loop gives up after ~30 min).
// Applying is real work, so it gets far more slack before we raise an eyebrow.
const AGENT_GONE_MS = 2 * 60_000;
const APPLY_SLOW_MS = 10 * 60_000;

const TONE_TEXT: Record<Tone, string> = {
  working: "text-muted-foreground",
  done: "text-emerald-600 dark:text-emerald-400",
  stopped: "text-amber-600 dark:text-amber-400",
};

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === "done")
    return <IconCheck className="size-3.5 shrink-0 mt-0.75" stroke={2.5} />;
  if (tone === "stopped")
    return <IconExclamationCircle className="size-3.5 shrink-0 mt-0.75" />;
  // The shared `Spinner` is an unconditional `animate-spin`, so the reduced-
  // motion opt-out has to be applied here.
  return (
    <Spinner className="size-3.5 shrink-0 motion-reduce:animate-none mt-0.75" />
  );
}

export function SetupSummary({
  plan,
  status,
  firstTraceId,
  approvedAt,
  agentResumedAt,
  failureStage,
  approveBlocked,
  onApprove,
  onReject,
  approving,
}: {
  plan: DetectedPlan;
  status: PlanStatus;
  firstTraceId?: string | null;
  /** ISO timestamps — tRPC serializes dates to strings on this app. */
  approvedAt?: string | null;
  agentResumedAt?: string | null;
  failureStage?: string | null;
  /** A decision is incomplete (customer attribution without an id source). */
  approveBlocked?: boolean;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  // Rejecting is terminal — the agent exits and the only way back is pasting
  // the whole prompt again — so one stray click next to Approve must not end
  // the session. First click arms, second click fires, a pause disarms.
  const [confirmReject, setConfirmReject] = useState(false);
  useEffect(() => {
    if (!confirmReject) return;
    const t = window.setTimeout(() => setConfirmReject(false), 5_000);
    return () => window.clearTimeout(t);
  }, [confirmReject]);

  // Recomputed on every poll-driven render (the page refetches every couple
  // of seconds while the plan can still move), so these flip on their own.
  const now = Date.now();
  const agentGone =
    status === "approved" &&
    approvedAt != null &&
    now - Date.parse(approvedAt) > AGENT_GONE_MS;
  const applyStartedAt = agentResumedAt ?? approvedAt;
  const applySlow =
    status === "applying" &&
    applyStartedAt != null &&
    now - Date.parse(applyStartedAt) > APPLY_SLOW_MS;
  const parts: string[] = [];
  const { agents, workflows, sessions } = plan.decisions;
  if (agents.length) parts.push(plural(agents.length, "agent"));
  if (workflows.length) parts.push(plural(workflows.length, "workflow"));
  if (sessions.length) parts.push(plural(sessions.length, "conversation flow"));
  if (plan.calls.length) parts.push(plural(plan.calls.length, "model call"));

  return (
    <Card className="rounded-[28px] squircle:rounded-[28px] py-0">
      <CardContent className="px-5 py-4">
        <h1 className="font-display text-[15px] font-semibold tracking-tight">
          Foglamp{" "}
          <span className="font-sans font-normal tracking-normal text-sm">
            found {phrase(parts)}.
          </span>
        </h1>
        {status === "awaiting_approval" ? (
          <>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant={confirmReject ? "destructive" : "secondary"}
                className="flex-1"
                onClick={() => {
                  if (confirmReject) onReject();
                  else setConfirmReject(true);
                }}
                disabled={approving}
              >
                {confirmReject ? "Really reject?" : "Reject"}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={onApprove}
                disabled={approving || approveBlocked}
              >
                {approving ? "Approving…" : "Approve"}
              </Button>
            </div>
            {approveBlocked ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                Add a customer id source below — or turn attribution off — to
                approve.
              </p>
            ) : null}
            {confirmReject ? (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Rejecting stops your agent; nothing in your repo changes.
              </p>
            ) : null}
          </>
        ) : (
          <div className={cn("mt-4")}>
            <div
              className={cn(
                "flex items-start gap-2",
                TONE_TEXT[STATUS_LINE[status].tone]
              )}
            >
              <StatusIcon tone={STATUS_LINE[status].tone} />
              <div className="flex flex-col gap-2">
                <p className="text-xs leading-relaxed">
                  {STATUS_LINE[status].text}
                  {status === "failed" && failureStage
                    ? ` It stopped while trying to ${failureStage} the plan.`
                    : null}
                </p>
              </div>
            </div>
            {agentGone ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                Still waiting? Your agent probably stopped listening. Send it
                any message — &ldquo;continue&rdquo; works — and it will pick
                this plan up.
              </p>
            ) : null}
            {applySlow ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                This is taking a while. Check your agent&rsquo;s output — it
                may be stuck or waiting on you.
              </p>
            ) : null}
            {status === "verified" && firstTraceId ? (
              <Button
                size="sm"
                className="w-full mt-4"
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
        )}
      </CardContent>
    </Card>
  );
}
