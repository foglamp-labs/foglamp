"use client";

import { Button } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import { Label } from "@foglamp/ui/components/label";
import {
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconTerminal2,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/marketing/brand-mark";
import { authClient } from "@/lib/auth-client";

// The verification step of `npx foglamp login`. The CLI prints a URL that lands
// the user here (already signed in — the page gates that). We first "claim" the
// user code for this account (GET /device), then let them approve or deny. On
// approve the CLI's token poll succeeds and it mints a key + writes .env.

type Phase =
  | "claiming" // verifying the code belongs to a live request
  | "ready" // claimed + pending — show approve/deny
  | "approved"
  | "denied"
  | "needCode" // no/blank code in the URL — ask the user to paste it
  | "error";

function errMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const e = error as { error_description?: string; message?: string };
    return e.error_description ?? e.message ?? fallback;
  }
  return fallback;
}

// Module-level so it keeps a stable identity across renders — a component
// defined inside DeviceApprove would remount its subtree on every keystroke
// (and the code input would lose focus).
function DeviceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col p-6">
      <div className="size-10 rounded-2xl corner-squircle bg-muted shadow-(--custom-shadow) flex justify-center items-center">
        <BrandMark className="w-7" />
      </div>
      {children}
    </div>
  );
}

export function DeviceApprove({
  initialUserCode,
  userEmail,
}: {
  initialUserCode: string;
  userEmail?: string | null;
}) {
  const [code, setCode] = useState(initialUserCode.trim());
  const [phase, setPhase] = useState<Phase>(
    initialUserCode.trim() ? "claiming" : "needCode",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Claim the code: associates it with the signed-in user and returns its
  // current status. Approve/deny both require this first (the server rejects an
  // unclaimed code), so it runs before we show the approve button.
  const claim = useCallback(async (userCode: string) => {
    setPhase("claiming");
    setMessage(null);
    const { data, error } = await authClient.$fetch<{
      user_code: string;
      status: string;
    }>("/device", { method: "GET", query: { user_code: userCode } });
    if (error) {
      setPhase("error");
      setMessage(errMessage(error, "That code is invalid or has expired."));
      return;
    }
    if (data?.status === "approved") {
      setPhase("approved");
    } else if (data?.status === "denied") {
      setPhase("denied");
    } else {
      setPhase("ready");
    }
  }, []);

  // Claim once on mount when the code arrived in the URL. Guard against the
  // effect firing twice (React strict mode) for the same code.
  const claimedFor = useRef<string | null>(null);
  useEffect(() => {
    const c = initialUserCode.trim();
    if (!c || claimedFor.current === c) return;
    claimedFor.current = c;
    void claim(c);
  }, [initialUserCode, claim]);

  const decide = async (action: "approve" | "deny") => {
    setBusy(true);
    const { error } = await authClient.$fetch(`/device/${action}`, {
      method: "POST",
      body: { userCode: code },
    });
    setBusy(false);
    if (error) {
      setPhase("error");
      setMessage(errMessage(error, `Could not ${action} the request.`));
      return;
    }
    setPhase(action === "approve" ? "approved" : "denied");
  };

  if (phase === "approved") {
    return (
      <DeviceShell>
        <div className="mt-5 flex items-center gap-2">
          <IconCircleCheckFilled className="size-5 text-green-500" />
          <h1 className="text-lg font-medium">Terminal connected</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground text-balance">
          You can return to your terminal — <code>foglamp login</code> will
          finish setting up and write your API key. You can close this tab.
        </p>
      </DeviceShell>
    );
  }

  if (phase === "denied") {
    return (
      <DeviceShell>
        <div className="mt-5 flex items-center gap-2">
          <IconCircleXFilled className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-medium">Request denied</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground text-balance">
          No device was connected. If this was a mistake, run{" "}
          <code>npx foglamp login</code> again to start over.
        </p>
      </DeviceShell>
    );
  }

  if (phase === "error") {
    return (
      <DeviceShell>
        <div className="mt-5 flex items-center gap-2">
          <IconCircleXFilled className="size-5 text-destructive" />
          <h1 className="text-lg font-medium">Couldn’t connect</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground text-balance">
          {message ?? "Something went wrong."}
        </p>
        <Button
          variant="secondary"
          className="mt-5 self-start"
          onClick={() => {
            claimedFor.current = null;
            setPhase(code ? "claiming" : "needCode");
            if (code) void claim(code);
          }}
        >
          Try again
        </Button>
      </DeviceShell>
    );
  }

  if (phase === "needCode") {
    return (
      <DeviceShell>
        <h1 className="mt-5 mb-1 text-lg font-medium">Connect your terminal</h1>
        <p className="mb-6 text-sm text-muted-foreground text-balance">
          Enter the code shown by <code>npx foglamp login</code> to continue.
        </p>
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim();
            if (c) void claim(c);
          }}
        >
          <Label htmlFor="user_code">Code</Label>
          <Input
            id="user_code"
            autoFocus
            autoComplete="off"
            placeholder="ABCD1234"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono tracking-widest uppercase"
          />
          <Button type="submit" className="mt-2 w-full" disabled={!code.trim()}>
            Continue
          </Button>
        </form>
      </DeviceShell>
    );
  }

  // claiming | ready
  return (
    <DeviceShell>
      <h1 className="mt-5 mb-1 text-lg font-medium">Connect your terminal</h1>
      <p className="mb-5 text-sm text-muted-foreground text-balance">
        <span className="inline-flex items-center gap-1.5">
          <IconTerminal2 className="size-4" />
          <code>npx foglamp login</code>
        </span>{" "}
        wants to connect to your Foglamp account
        {userEmail ? (
          <>
            {" "}
            (<span className="text-foreground">{userEmail}</span>)
          </>
        ) : null}{" "}
        and create an API key. Only approve this if you started it.
      </p>

      <div className="mb-6 flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
        <span className="text-xs text-muted-foreground">Code</span>
        <code className="font-mono text-base tracking-widest uppercase">
          {code || "—"}
        </code>
      </div>

      <div className="flex flex-col gap-2.5">
        <Button
          className="w-full"
          disabled={phase !== "ready" || busy}
          onClick={() => void decide("approve")}
        >
          {phase === "claiming"
            ? "Verifying…"
            : busy
              ? "Connecting…"
              : "Approve & connect"}
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={phase !== "ready" || busy}
          onClick={() => void decide("deny")}
        >
          Deny
        </Button>
      </div>
    </DeviceShell>
  );
}
