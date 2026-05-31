"use client";

import { IconCircleCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import { Button } from "@foglamp/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@foglamp/ui/components/tabs";
import { useState } from "react";

// Empty state for the Agents / Workflows pages: the usual dashed card plus a
// copy-pasteable instrumentation snippet, toggled between the AI SDK v7 native
// path (`foglamp().integration`) and the v4–v6 wrapping path (`foglamp/wrap`).

type Feature = "agent" | "workflow";

const SNIPPETS: Record<Feature, { v7: string; v6: string }> = {
  agent: {
    v7: `import { foglamp } from "foglamp";

const fog = foglamp();

await generateText({
  model,
  prompt,
  telemetry: {
    integrations: [fog.integration({ agentName: "my-agent" })],
  },
});`,
    v6: `import * as ai from "ai";
import { wrap } from "foglamp/wrap";

const { generateText } = wrap(ai, {
  context: { agentName: "my-agent" },
});

await generateText({ model, prompt });`,
  },
  workflow: {
    v7: `import { foglamp } from "foglamp";

const fog = foglamp();

await generateText({
  model,
  prompt,
  telemetry: {
    integrations: [
      fog.integration({
        workflowName: "nightly-digest",
        workflowRunId: run.id,
      }),
    ],
  },
});`,
    v6: `import * as ai from "ai";
import { wrap } from "foglamp/wrap";

const { generateText } = wrap(ai, {
  context: {
    workflowName: "nightly-digest",
    workflowRunId: run.id,
  },
});

await generateText({ model, prompt });`,
  },
};

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <pre className="overflow-auto rounded-md bg-muted p-3 pr-10 text-left text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute right-1.5 top-1.5"
        aria-label="Copy code"
        onClick={copy}
      >
        {copied ? <IconCircleCheckFilled /> : <IconCopyFilled />}
      </Button>
    </div>
  );
}

export function InstrumentEmptyState({
  feature,
  icon: Icon,
  title,
  description,
}: {
  feature: Feature;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  const snip = SNIPPETS[feature];
  return (
    <Empty className="rounded-lg border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="opacity-40" />
        </EmptyMedia>
        <EmptyContent>
          <EmptyTitle>{title}</EmptyTitle>
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyContent>
      </EmptyHeader>

      <Tabs defaultValue="v7" className="w-full max-w-xl">
        <TabsList>
          <TabsTrigger value="v7">AI SDK v7</TabsTrigger>
          <TabsTrigger value="v6">AI SDK v6 or lower</TabsTrigger>
        </TabsList>
        <TabsContent value="v7">
          <CodeBlock code={snip.v7} />
        </TabsContent>
        <TabsContent value="v6">
          <CodeBlock code={snip.v6} />
        </TabsContent>
      </Tabs>
    </Empty>
  );
}
