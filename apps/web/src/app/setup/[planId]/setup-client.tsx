"use client";

import { isPending as isPlanPending } from "@foglamp/contracts/instrumentation";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { Spinner } from "@foglamp/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { PROJECT_STORAGE_KEY } from "@/components/app/project-context";
import { SetupBoard } from "@/components/setup/setup-board";
import { BrandMark } from "@/components/marketing/brand-mark";
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
      },
    ),
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

  const approve = useMutation(
    trpc.instrumentationPlans.approve.mutationOptions({
      onSuccess: async () => {
        captureActivationEvent("instrumentation_plan_approved");
        // Refetch immediately: the agent resumes within a second or so, and the
        // page should be showing "applying" by the time the user looks up.
        await qc.invalidateQueries({ queryKey });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const reject = useMutation(
    trpc.instrumentationPlans.reject.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (isLoading) {
    return (
      <Centered>
        <Spinner className="size-5 text-muted-foreground motion-reduce:animate-none" />
        <p className="text-sm text-muted-foreground">Loading your plan…</p>
      </Centered>
    );
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
        <Button variant="secondary" onClick={() => void qc.invalidateQueries({ queryKey })}>
          Try again
        </Button>
      </Centered>
    );
  }

  return (
    <SetupBoard
      plan={data.detected}
      status={data.status}
      firstTraceId={data.firstTraceId}
      spanCount={data.spanCount}
      secondsToFirstTrace={data.secondsToFirstTrace}
      failureStage={data.failureStage}
      filesChanged={data.applied?.filesChanged.length}
      onApprove={() => approve.mutate({ planId })}
      onReject={() => reject.mutate({ planId })}
      approving={approve.isPending || reject.isPending}
    />
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
