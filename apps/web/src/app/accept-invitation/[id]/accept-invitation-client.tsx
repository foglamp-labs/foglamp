"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconCodeAsterix } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

type Invitation = {
  email: string;
  role: string;
  organizationName: string;
  inviterEmail: string;
};

type LoadError = {
  // "wrong-account" → signed in as someone other than the invitee; the fix is
  // switching accounts, not retrying. Everything else is a dead invitation.
  kind: "wrong-account" | "invalid";
  message: string;
};

export function AcceptInvitationClient({
  invitationId,
}: {
  invitationId: string;
}) {
  const { data: session } = authClient.useSession();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (cancelled) return;
      if (res.error) {
        const message = res.error.message ?? "";
        const wrongAccount = /recipient|email/i.test(message);
        setLoadError(
          wrongAccount
            ? {
                kind: "wrong-account",
                message:
                  "This invitation was sent to a different email address.",
              }
            : {
                kind: "invalid",
                message:
                  "This invitation is no longer valid. It may have expired, been revoked, or already been used.",
              }
        );
        return;
      }
      const d = res.data;
      setInvite({
        email: d.email,
        role: d.role,
        organizationName: d.organizationName,
        inviterEmail: d.inviterEmail,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  const accept = async () => {
    setPending("accept");
    try {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(res.error.message ?? "Could not accept the invitation.");
        return;
      }
      setResult("accepted");
    } finally {
      setPending(null);
    }
  };

  const decline = async () => {
    setPending("decline");
    try {
      const res = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(res.error.message ?? "Could not decline the invitation.");
        return;
      }
      setResult("declined");
    } finally {
      setPending(null);
    }
  };

  // Sign out, then bounce through /login with the invite as the return path so
  // the right account lands straight back here.
  const switchAccount = async () => {
    await authClient.signOut();
    window.location.href = `/login?next=${encodeURIComponent(
      `/accept-invitation/${invitationId}`
    )}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <div className="size-10 rounded-lg bg-muted flex justify-center items-center">
        <IconCodeAsterix className="size-6 stroke-1" />
      </div>

      {result === "accepted" ? (
        <>
          <div className="mt-5 flex flex-col gap-2">
            <h1 className="text-xl font-medium text-balance">
              Welcome to {invite?.organizationName ?? "the organization"}
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ve joined as{" "}
              <span className="font-medium text-foreground">
                {invite?.role ?? "member"}
              </span>
              .
            </p>
          </div>
          <Button
            size="sm"
            className="self-start"
            // Hard navigation so the app shell refetches the project list with
            // the new membership.
            onClick={() => {
              window.location.href = "/overview";
            }}
          >
            Go to dashboard
          </Button>
        </>
      ) : result === "declined" ? (
        <>
          <div className="mt-5 flex flex-col gap-2">
            <h1 className="text-xl font-medium text-balance">
              Invitation declined
            </h1>
            <p className="text-sm text-muted-foreground">
              You won&apos;t join{" "}
              {invite?.organizationName ?? "the organization"}. If this was a
              mistake, ask for a new invitation.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => {
              window.location.href = "/overview";
            }}
          >
            Go to dashboard
          </Button>
        </>
      ) : loadError ? (
        <>
          <div className="mt-5 flex flex-col gap-2">
            <h1 className="text-xl font-medium text-balance">
              {loadError.kind === "wrong-account"
                ? "This invitation isn't for this account"
                : "Invitation unavailable"}
            </h1>
            <p className="text-sm text-muted-foreground text-balance">
              {loadError.message}
            </p>
            {loadError.kind === "wrong-account" && session?.user?.email && (
              <p className="text-sm text-muted-foreground">
                You&apos;re signed in as{" "}
                <span className="font-medium text-foreground">
                  {session.user.email}
                </span>
                .
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {loadError.kind === "wrong-account" && (
              <Button size="sm" className="self-start" onClick={switchAccount}>
                Sign in with a different account
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => {
                window.location.href = "/overview";
              }}
            >
              Go to dashboard
            </Button>
          </div>
        </>
      ) : !invite ? (
        <div className="mt-5 flex flex-col gap-2">
          <h1 className="text-xl font-medium text-balance">Invitation</h1>
          <p className="text-sm text-muted-foreground">Loading invitation…</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-2">
            <h1 className="text-xl font-medium text-balance">
              Join {invite.organizationName}
            </h1>
            <p className="text-sm text-muted-foreground text-balance">
              <span className="font-medium text-foreground">
                {invite.inviterEmail}
              </span>{" "}
              invited{" "}
              <span className="font-medium text-foreground">
                {invite.email}
              </span>{" "}
              to join as{" "}
              <span className="font-medium text-foreground">{invite.role}</span>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="self-start"
              disabled={pending !== null}
              onClick={accept}
            >
              {pending === "accept" ? "Accepting…" : "Accept invitation"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={pending !== null}
              onClick={decline}
            >
              {pending === "decline" ? "Declining…" : "Decline"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
