"use client";

import { Button } from "@foglamp/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/app/page-parts";
import { authClient } from "@/lib/auth-client";

type State = "accepting" | "done" | "error";

export function AcceptInvitationClient({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("accepting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await authClient.organization.acceptInvitation({ invitationId });
      if (cancelled) return;
      if (res.error) {
        setMessage(res.error.message ?? "This invitation is no longer valid.");
        setState("error");
      } else {
        setState("done");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  return (
    <>
      <PageHeader title="Invitation" />
      <div className="flex flex-col items-start gap-3">
        {state === "accepting" && (
          <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
        )}
        {state === "done" && (
          <>
            <p className="text-sm">You've joined the organization.</p>
            <Button size="sm" onClick={() => router.push("/overview")}>
              Go to dashboard
            </Button>
          </>
        )}
        {state === "error" && (
          <p className="text-sm text-destructive">{message}</p>
        )}
      </div>
    </>
  );
}
