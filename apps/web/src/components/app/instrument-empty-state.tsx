"use client";

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

import { CodeBlock } from "./code-block";

// Empty state for the Agents / Workflows / Sessions pages: the usual dashed card
// plus a copy-pasteable instrumentation snippet, toggled between the AI SDK v7
// native path (`foglamp().integration`) and the v4–v6 wrapping path
// (`foglamp/wrap`).

type Feature = "agent" | "workflow" | "session";

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
  session: {
    v7: `import { foglamp } from "foglamp";

const fog = foglamp();

await generateText({
  model,
  prompt,
  telemetry: {
    integrations: [
      fog.integration({
        agentName: "support",
        sessionId: user.threadId,
      }),
    ],
  },
});`,
    v6: `import * as ai from "ai";
import { wrap } from "foglamp/wrap";

const { generateText } = wrap(ai, {
  context: {
    agentName: "support",
    sessionId: user.threadId,
  },
});

await generateText({ model, prompt });`,
  },
};

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
