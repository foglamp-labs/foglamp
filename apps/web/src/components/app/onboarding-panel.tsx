"use client";

import {
  IconBoltFilled,
  IconBookFilled,
  IconClipboardCheckFilled,
  IconExternalLink,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BorderBeam } from "border-beam";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useEffect, useRef, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useProject } from "@/components/app/project-context";
import { useCopied } from "@/components/app/use-copied";
import { buildKeyedPrompt, DOCS_URL } from "@/lib/agent-prompt";
import { trpc } from "@/utils/trpc";

const KEY_NAME = "Onboarding";

export function OnboardingPanel() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  // Brighten the beam while the copy button is hovered/focused, to draw the eye
  // to the primary action. Drives the BorderBeam `strength` prop below.
  const [copyActive, setCopyActive] = useState(false);
  const { copied, markCopied } = useCopied(2000);
  const mintedRef = useRef(false);

  const keys = useQuery({
    ...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const createKey = useMutation(
    trpc.projects.keys.create.mutationOptions({
      onSuccess: () =>
        void qc.invalidateQueries({
          queryKey: trpc.projects.keys.list.queryKey(),
        }),
    })
  );
  // Once keys have loaded, ensure we hold a usable key to inline — no click.
  // The plaintext only exists at mint time, so we cache it in localStorage and
  // reuse it while the key still exists server-side. NEVER delete or revoke a
  // prior onboarding key here: the user may have already pasted it into an
  // app, and invalidating it silently kills their traces.
  useEffect(() => {
    if (!projectId || keys.isLoading || mintedRef.current) return;
    mintedRef.current = true;
    const cacheKey = `foglamp:onboarding-key:${projectId}`;
    void (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as {
          id: string;
          key: string;
        } | null;
        if (
          cached &&
          (keys.data ?? []).some((k) => k.id === cached.id && !k.revokedAt)
        ) {
          setRevealedKey(cached.key);
          return;
        }
      } catch {
        // Corrupt cache — fall through and mint a fresh key.
      }
      const res = await createKey.mutateAsync({ projectId, name: KEY_NAME });
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ id: res.id, key: res.key })
        );
      } catch {
        // Storage unavailable (private mode/quota) — the key still works this visit.
      }
      setRevealedKey(res.key);
    })();
  }, [projectId, keys.isLoading, keys.data, createKey]);

  const prompt = revealedKey ? buildKeyedPrompt(revealedKey) : null;
  const copy = () => {
    if (!prompt) return;
    void navigator.clipboard.writeText(prompt);
    markCopied();
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BorderBeam
        size="pulse-inner"
        colorVariant="colorful"
        strength={copyActive ? 1 : 0.6}
        borderRadius={16}
      >
        {/* The beam shapes its ring with clip-path: inset(round) — always a
            circular arc, immune to corner-shape — so it can't be a squircle.
            corner-round! drops the Card's default superellipse to a plain round
            corner at the same 22px (rounded-3xl) radius so the edges align. */}
        <Card className="h-full corner-round! rounded-2xl!">
          <CardHeader>
            <CardTitle className="flex items-center gap-[6px]">
              <IconClipboardCheckFilled className="size-4" />
              Prompt
            </CardTitle>
            <CardDescription>
              Paste this into your coding agent to install and wire up the SDK.
            </CardDescription>
            <CardAction className="self-center">
              {prompt ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={copy}
                  onMouseEnter={() => setCopyActive(true)}
                  onMouseLeave={() => setCopyActive(false)}
                  onFocus={() => setCopyActive(true)}
                  onBlur={() => setCopyActive(false)}
                  aria-label="Copy prompt"
                >
                  <CopyIcon
                    copied={copied}
                    checkClassName="text-green-400 dark:text-green-600"
                  />
                  Copy the prompt
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Preparing your key…
                </p>
              )}
            </CardAction>
          </CardHeader>
        </Card>
      </BorderBeam>

      {/* No beam here, but match the beamed card's plain round corner so the
          side-by-side pair stays visually consistent. */}
      <Card className="h-full corner-round!">
        <CardHeader>
          <CardTitle className="flex items-center gap-[6px]">
            <IconBookFilled className="size-4" />
            Old School
          </CardTitle>
          <CardDescription>
            Prefer to wire it up by hand? Follow the full instrumentation guide.
          </CardDescription>
          <CardAction className="self-center">
            <Button
              size="sm"
              variant="secondary"
              render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}
            >
              <IconExternalLink />
              View the docs
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
    </div>
  );
}
