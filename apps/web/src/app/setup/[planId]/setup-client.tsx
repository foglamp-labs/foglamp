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

  // Browsers won't let a page close a tab it didn't open, so the next best
  // thing to "approve closes the tab" is saying out loud that closing is safe:
  // the agent is unblocked the moment the approval lands, not when this page
  // is looked at.
  const [approvedOpen, setApprovedOpen] = useState(false);

  const approve = useMutation(
    trpc.instrumentationPlans.approve.mutationOptions({
      onSuccess: async () => {
        captureActivationEvent("instrumentation_plan_approved");
        setApprovedOpen(true);
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
        status={data.status}
        firstTraceId={data.firstTraceId}
        failureStage={data.failureStage}
        onApprove={(edits) => approve.mutate({ planId, edits })}
        onReject={() => reject.mutate({ planId })}
        approving={approve.isPending || reject.isPending}
      />
      <Dialog open={approvedOpen} onOpenChange={setApprovedOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Approved — you're done here</DialogTitle>
            <DialogDescription>
              Your coding agent picked the plan up and is implementing the
              instrumentation on its own. You can close this tab — or keep it
              open to watch your first trace land.
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
