"use client";

import {
  IconCircleCheckFilled,
  IconCopyFilled,
  IconSparkles,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@foglamp/ui/components/input-group";
import { useEffect, useRef, useState } from "react";

import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

const DOCS_URL = "https://docs.foglamp.dev/ai-instrument";
const KEY_NAME = "Onboarding";

// The prompt a user pastes into their coding agent. The key is inlined so it's
// truly paste-and-go; the agent fetches the docs and wires the SDK against the
// user's own codebase (mapping agents → agentName, flows → workflowName/runId).
function buildPrompt(apiKey: string): string {
  return `Instrument this app with Foglamp tracing (observability for AI agents).

1. Install the SDK:  npm i foglamp
2. Add to .env:      FOGLAMP_API_KEY=${apiKey}
3. Read ${DOCS_URL} and wire the Vercel AI SDK integration:
   wrap my generateText / streamText calls with fog.integration(...), and based
   on my codebase map each agent to \`agentName\` and any multi-step pipeline to
   a shared \`workflowName\` + \`workflowRunId\` (one-off calls get a \`traceName\`).
4. Run the app once so a trace is produced.

The SDK is a no-op until FOGLAMP_API_KEY is set, so this is safe to add anywhere.`;
}

export function OnboardingPanel() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mintedRef = useRef(false);

  const keys = useQuery({
    ...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const createKey = useMutation(
    trpc.projects.keys.create.mutationOptions({
      onSuccess: () =>
        void qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() }),
    }),
  );
  const revokeKey = useMutation(trpc.projects.keys.revoke.mutationOptions({}));

  // Once keys have loaded, ensure we hold a usable key to inline — no click.
  // Plaintext can't be recovered, so revoke any prior onboarding key and mint a
  // fresh one (covers both first visit and reloads). Runs once per mount.
  useEffect(() => {
    if (!projectId || keys.isLoading || mintedRef.current) return;
    mintedRef.current = true;
    const stale = (keys.data ?? []).filter(
      (k) => !k.revokedAt && k.name === KEY_NAME,
    );
    void (async () => {
      for (const k of stale) {
        await revokeKey.mutateAsync({ projectId, keyId: k.id });
      }
      const res = await createKey.mutateAsync({ projectId, name: KEY_NAME });
      setRevealedKey(res.key);
    })();
  }, [projectId, keys.isLoading, keys.data, createKey, revokeKey]);

  const prompt = revealedKey ? buildPrompt(revealedKey) : null;
  const copy = () => {
    if (!prompt) return;
    void navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSparkles className="size-5 text-fuchsia-500" />
          Get your first trace
        </CardTitle>
        <CardDescription>
          Paste this into your coding agent (Claude Code, Cursor, …). It installs
          the SDK and instruments your app — including your agents and workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {prompt ? (
          <InputGroup>
            <InputGroupTextarea
              readOnly
              value={prompt}
              rows={9}
              className="font-mono text-xs"
            />
            <InputGroupAddon align="inline-end">
              <Button size="icon-sm" variant="ghost" onClick={copy} aria-label="Copy prompt">
                {copied ? <IconCircleCheckFilled /> : <IconCopyFilled />}
              </Button>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <p className="text-sm text-muted-foreground">Preparing your key…</p>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-fuchsia-500" />
          </span>
          Waiting for your first trace… this page updates automatically.
        </div>

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Prefer to do it manually?</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
            {`npm i foglamp
# .env
FOGLAMP_API_KEY=${revealedKey ?? "fl_…"}

import { foglamp } from "foglamp";
const fog = foglamp();

await generateText({
  model,
  prompt,
  experimental_telemetry: {
    isEnabled: true,
    integrations: [fog.integration({ agentName: "my-agent" })],
  },
});`}
          </pre>
          <a href={DOCS_URL} className="underline" target="_blank" rel="noreferrer">
            Full instrumentation guide →
          </a>
        </details>
      </CardContent>
    </Card>
  );
}
