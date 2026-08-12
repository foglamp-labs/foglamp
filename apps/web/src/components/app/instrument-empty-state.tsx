"use client";

import { Button } from "@foglamp/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@foglamp/ui/components/empty";
import { cn } from "@foglamp/ui/lib/utils";
import { motion } from "motion/react";
import { useId, useState } from "react";

import { CodeBlock } from "./code-block";
import { CopyIcon } from "./copy-icon";
import { useCopied } from "./use-copied";

// Same spring as ViewToggle, so segmented controls across the app glide
// identically.
const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

type SdkVersion = "v7" | "v6";

const SDK_OPTIONS: { value: SdkVersion; label: string }[] = [
	{ value: "v7", label: "v7" },
	{ value: "v6", label: "v6 or lower" },
];

/** A two-option segmented control for switching between AI SDK snippets.
 * Sized to sit flush next to the CodeBlock's copy button. */
function SdkToggle({
	value,
	onChange,
}: {
	value: SdkVersion;
	onChange: (value: SdkVersion) => void;
}) {
	// Unique per instance so each mounted toggle owns its own sliding pill.
	const pillId = useId();
	return (
		<div className="inline-flex h-8 items-center rounded-full px-1 p-0.5 dark:bg-input/20 bg-card shadow-(--custom-shadow) dark:shadow-(--custom-shadow)">
			{SDK_OPTIONS.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(opt.value)}
						className={cn(
							"relative flex h-6 cursor-pointer items-center justify-center rounded-full px-2.5 text-xs transition-colors",
							active
								? "text-foreground"
								: "text-muted-foreground/60 hover:text-foreground",
						)}
					>
						{active && (
							<motion.span
								layoutId={pillId}
								transition={MORPH}
								className="absolute inset-0 rounded-full bg-input dark:bg-input/50"
							/>
						)}
						<span className="relative z-10">{opt.label}</span>
					</button>
				);
			})}
		</div>
	);
}

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
	const [version, setVersion] = useState<SdkVersion>("v7");
	const { copied, markCopied } = useCopied(2000);

	const copy = () => {
		void navigator.clipboard.writeText(snip[version]);
		markCopied();
	};

	return (
		<Empty className="border border-dashed">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon className="opacity-40" />
				</EmptyMedia>
				<EmptyContent>
					<EmptyTitle>{title}</EmptyTitle>
					{description && <EmptyDescription>{description}</EmptyDescription>}
				</EmptyContent>
			</EmptyHeader>

			{/* Both snippets share one grid cell, so the row is always sized to the
          taller one — toggling never changes layout height (nothing above
          shifts). The inactive snippet stays in the layout at opacity-0 and we
          crossfade between them. `inert` keeps the hidden copy out of the tab
          order and clicks. The toggle + copy button live in a single overlay
          outside the fading layers so they hold steady while the code fades. */}
			<div className="relative grid w-full max-w-xl">
				{SDK_OPTIONS.map(({ value }) => {
					const active = value === version;
					return (
						<div
							key={value}
							inert={!active}
							className={cn(
								"col-start-1 row-start-1 transition-opacity duration-200",
								active ? "opacity-100" : "opacity-0",
							)}
						>
							<CodeBlock code={snip[value]} hideCopy />
						</div>
					);
				})}
				<div className="absolute right-3 top-3 flex items-center gap-1">
					<SdkToggle value={version} onChange={setVersion} />
					<Button
						size="icon-sm"
						variant="outline"
						className="text-muted-foreground hover:text-foreground dark:bg-input/20"
						aria-label="Copy code"
						onClick={copy}
					>
						<CopyIcon copied={copied} />
					</Button>
				</div>
			</div>
		</Empty>
	);
}
