"use client";

import {
  IconBoltFilled,
  IconBookFilled,
  IconClipboardCheckFilled,
  IconExternalLink,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { trpc } from "@/utils/trpc";

const DOCS_URL = "https://docs.foglamp.dev/quickstart";
// Markdown page written for coding agents — the canonical instrumentation
// instructions (v7 requirement, mapping rules, serverless flush, verification).
const AGENT_DOCS_URL = "https://docs.foglamp.dev/ai-instrument.md";
const LLMS_INDEX_URL = "https://docs.foglamp.dev/llms.txt";
const KEY_NAME = "Onboarding";

// A soft rainbow gradient ring: a 1px gradient-filled wrapper that the opaque
// card sits inside, so only the thin border shows the rainbow. The conic
// gradient rotates slowly via the registered --rainbow-angle property.
const RAINBOW_RING =
  "rounded-3xl corner-squircle p-px animate-rainbow-spin bg-[conic-gradient(from_var(--rainbow-angle),rgba(244,114,182,0.55),rgba(167,139,250,0.55),rgba(96,165,250,0.55),rgba(110,231,183,0.55),rgba(253,224,71,0.55),rgba(252,165,165,0.55),rgba(244,114,182,0.55))]";

// The prompt a user pastes into their coding agent. The key is inlined so it's
// truly paste-and-go. Detailed instructions live in the agent-targeted docs
// page (single source of truth); the prompt only sets up the key and points
// the agent there, plus the llms.txt index as the deeper-docs escape hatch.
function buildPrompt(apiKey: string): string {
  return `Instrument this app with Foglamp tracing (observability for Vercel AI SDK apps).

1. Install the \`foglamp\` package with this repo's package manager (npm/pnpm/yarn/bun).
2. Add to .env:      FOGLAMP_API_KEY=${apiKey}
3. Fetch ${AGENT_DOCS_URL} (written for coding agents) and follow it:
   wrap my generateText / streamText calls with fog.integration(...), and based
   on my codebase map each agent to \`agentName\`, any multi-step pipeline to a
   shared \`workflowName\` + \`workflowRunId\`, and any conversation thread to a
   \`sessionId\` — real user conversations only; a batch/cron/pipeline run is a
   workflow, not a session (one-off calls get a \`traceName\`). The docs explain how to pick
   good values — read the codebase and map it properly, don't just label
   everything with one name. Names (\`agentName\`/\`workflowName\`/\`traceName\`)
   must be static string literals — anything dynamic (an id, slug, URL, date)
   goes in \`metadata\`, \`workflowRunId\`, or \`sessionId\`, never in a name.
4. Do NOT write smoke tests, scripts, or demo endpoints to produce a first
   trace. When you're done, just tell me how to trigger my app's real AI flows
   (which command to run, which page to hit) — I'll run them and watch the
   traces land in Foglamp.

Notes: the steps above target the Vercel AI SDK v7. If this repo is on AI SDK
v4–v6, use \`wrap()\` from \`foglamp/wrap\` instead — see
https://docs.foglamp.dev/sdk/wrap.md (same trace context options apply). The SDK
is a no-op until FOGLAMP_API_KEY is set, so it is safe to add in every
environment. Full docs index: ${LLMS_INDEX_URL}`;
}

export function OnboardingPanel() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
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

  const prompt = revealedKey ? buildPrompt(revealedKey) : null;
  const copy = () => {
    if (!prompt) return;
    void navigator.clipboard.writeText(prompt);
    markCopied();
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={RAINBOW_RING}>
        <Card className="h-full">
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
      </div>

      <div className={RAINBOW_RING}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-[6px]">
              <IconBookFilled className="size-4" />
              Old School
            </CardTitle>
            <CardDescription>
              Prefer to wire it up by hand? Follow the full instrumentation
              guide.
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
    </div>
  );
}
