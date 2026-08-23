"use client";

import { isPending as isPlanPending } from "@foglamp/contracts/instrumentation";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foglamp/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PROJECT_STORAGE_KEY } from "@/components/app/project-context";
import { BrandMark } from "@/components/marketing/brand-mark";
import { SetupBoard } from "@/components/setup/setup-board";
import { captureActivationEvent } from "@/lib/analytics";
import { trpc } from "@/utils/trpc";

// The browser half of the approval loop. The user's coding agent is blocked on
// a long-poll against the server while this page is open, so the two things
// that matter here are: show the plan honestly, and make approval land fast.

/** How often to re-read the plan while it can still change. */
const POLL_MS = 2_000;

/**
 * Polling `applied` runs the first-trace probe (a ClickHouse query) on every
 * tick, and "waiting for the user to trigger a flow" can last a long while —
 * so that one state backs off instead of hammering: snappy for the first
 * minute (the demo case: agent applies, user triggers immediately), then
 * progressively lazier.
 */
function appliedPollMs(appliedAt: string | null | undefined): number {
  const since = Date.now() - (appliedAt ? Date.parse(appliedAt) : Date.now());
  if (since < 60_000) return POLL_MS;
  if (since < 300_000) return 5_000;
  return 10_000;
}

export function SetupClient({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const queryKey = trpc.instrumentationPlans.get.queryKey({ planId });

  const { data, isLoading, error } = useQuery(
    trpc.instrumentationPlans.get.queryOptions(
      { planId },
      {
        // Terminal plans never change again, so polling stops on its own.
        // `applied` is non-terminal on purpose: each poll re-runs the
        // first-trace probe, which is what moves the page to verified.
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          if (status && !isPlanPending(status)) return false;
          if (status === "applied") {
            return appliedPollMs(query.state.data?.appliedAt);
          }
          return POLL_MS;
        },
        retry: false,
      }
    )
  );

  // Point the app at this plan's project before any link leaves the page —
  // otherwise "view your first trace" opens in whichever project was last
  // selected, which for a brand-new user is a different one entirely.
  useEffect(() => {
    if (!data?.projectId) return;
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, data.projectId);
    } catch {
      // Private mode / storage disabled — the link still works, it just may
      // land on another project. Not worth blocking the page for.
    }
  }, [data?.projectId]);

  // Once per plan, not once per poll.
  const viewed = useRef(false);
  useEffect(() => {
    if (!data || viewed.current) return;
    viewed.current = true;
    captureActivationEvent("instrumentation_plan_viewed", {
      status: data.status,
      calls: data.detected.calls.length,
      agents: data.detected.decisions.agents.length,
      sdk_major: data.detected.sdk.major,
    });
  }, [data]);

  // Approving is the end of the user's job here — the agent is unblocked the
  // moment the approval lands, so the tab tries to close itself. Browsers only
  // honor window.close() for tabs with no real history (which is exactly what
  // the agent's `open <reviewUrl>` produces, on Chromium at least); when it's
  // blocked the dialog says out loud that closing is safe.
  const [approvedOpen, setApprovedOpen] = useState(false);

  const approve = useMutation(
    trpc.instrumentationPlans.approve.mutationOptions({
      onSuccess: async () => {
        captureActivationEvent("instrumentation_plan_approve_clicked");
        window.close();
        // Only reached when the browser refused to close the tab. The delay
        // keeps the dialog from flashing during an honored close.
        window.setTimeout(() => setApprovedOpen(true), 400);
        // Refetch immediately: the agent resumes within a second or so, and the
        // page should be showing "applying" by the time the user looks up.
        await qc.invalidateQueries({ queryKey });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const reject = useMutation(
    trpc.instrumentationPlans.reject.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (isLoading) {
    return null;
  }

  if (error || !data) {
    const notFound = error?.data?.code === "NOT_FOUND";
    return (
      <Centered>
        <h1 className="text-lg font-medium">
          {notFound ? "We couldn’t find that plan" : "Something went wrong"}
        </h1>
        <p className="max-w-sm text-center text-sm text-balance text-muted-foreground">
          {notFound
            ? "This link may belong to another account, or the plan may have been cleaned up. Run the setup prompt again to get a fresh one."
            : (error?.message ?? "Try reloading the page.")}
        </p>
        <Button
          variant="secondary"
          onClick={() => void qc.invalidateQueries({ queryKey })}
        >
          Try again
        </Button>
      </Centered>
    );
  }

  return (
    <>
      <SetupBoard
        plan={data.detected}
        approved={data.approved}
        applied={data.applied}
        status={data.status}
        firstTraceId={data.firstTraceId}
        approvedAt={data.approvedAt}
        agentResumedAt={data.agentResumedAt}
        spanCount={data.spanCount}
        secondsToFirstTrace={data.secondsToFirstTrace}
        failureStage={data.failureStage}
        onApprove={(edits) => approve.mutate({ planId, edits })}
        onReject={() => reject.mutate({ planId })}
        approving={approve.isPending || reject.isPending}
      />
      <Dialog open={approvedOpen} onOpenChange={setApprovedOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Approved</DialogTitle>
            <DialogDescription>
              Your coding agent picked the plan up and is implementing the
              instrumentation. You can close this tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setApprovedOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-fit">
        <CardContent className="flex flex-col items-center gap-3 px-8 py-8">
          <BrandMark className="mb-1 w-7" />
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
