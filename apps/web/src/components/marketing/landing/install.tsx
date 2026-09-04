import { DOCS_ORIGIN } from "@/lib/links";

import { CopyPromptButton } from "./copy-prompt-button";

// The setup section, with the actual setup in it: the two-line diff on the
// left, the three steps of the prompt path on the right. No abstract art.

type DiffLine = { kind: "add" | "ctx"; text: string };

const DIFF: DiffLine[] = [
	{ kind: "ctx", text: 'import { generateText } from "ai";' },
	{ kind: "add", text: 'import { registerTelemetry } from "ai";' },
	{ kind: "add", text: 'import { foglamp } from "foglamp";' },
	{ kind: "ctx", text: "" },
	{ kind: "add", text: "registerTelemetry(foglamp());" },
	{ kind: "ctx", text: "" },
	{ kind: "ctx", text: "export async function support(input: string) {" },
	{ kind: "ctx", text: "  return generateText({" },
	{ kind: "ctx", text: '    model: "anthropic/claude-fable-5-1",' },
	{ kind: "ctx", text: "    prompt: input," },
	{ kind: "ctx", text: "  });" },
	{ kind: "ctx", text: "}" },
];

const STEPS = [
	{
		index: "01",
		title: "Copy the prompt.",
		body: "It tells your coding agent which Vercel AI SDK version you run and which setup path applies.",
	},
	{
		index: "02",
		title: "Paste it into Claude Code, Cursor, or Codex.",
		body: "The agent installs the package, adds the two lines, and puts the API key name in your .env.example.",
	},
	{
		index: "03",
		title: "Approve the diff.",
		body: "Nothing about your prompts, tools, or logic changes. Spans start arriving on the next request.",
	},
];

function DiffBlock() {
	return (
		<figure className="m-0 min-w-0">
			<div className="overflow-hidden rounded-xl ring-1 ring-border">
				<div className="flex items-center justify-between border-b border-border/60 px-4 py-2 font-mono text-[11px] text-muted-foreground">
					<span>lib/support.ts</span>
					<span className="text-emerald-600 dark:text-emerald-500">+3</span>
				</div>
				<pre className="overflow-x-auto py-3 font-mono text-[13px] leading-6">
					<code>
						{DIFF.map((line, i) => (
							<span
								key={i}
								className={
									line.kind === "add"
										? "block bg-emerald-500/10 pr-4 text-foreground"
										: "block pr-4 text-muted-foreground"
								}
							>
								<span
									aria-hidden
									className={
										line.kind === "add"
											? "inline-block w-8 select-none pl-3 text-emerald-600 dark:text-emerald-500"
											: "inline-block w-8 select-none pl-3 text-muted-foreground/40"
									}
								>
									{line.kind === "add" ? "+" : " "}
								</span>
								{line.text || " "}
							</span>
						))}
					</code>
				</pre>
			</div>
			<figcaption className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
				Fig. 05. The whole integration, AI SDK v7.
			</figcaption>
		</figure>
	);
}

export function Install() {
	return (
		<section className="mx-auto mt-32 w-full max-w-7xl px-5 sm:mt-40 sm:px-8">
			<header className="max-w-2xl">
				<h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
					Two lines. One prompt.
				</h2>
				<p className="mt-3 max-w-md text-muted-foreground text-pretty">
					Register Foglamp with the AI SDK and every generateText and streamText
					call is traced. Or let your coding agent do it.
				</p>
			</header>

			<div className="mt-12 grid min-w-0 gap-12 lg:grid-cols-2 lg:gap-20">
				<DiffBlock />

				<div className="flex min-w-0 flex-col">
					<ol className="flex flex-col">
						{STEPS.map((step) => (
							<li
								key={step.index}
								className="grid grid-cols-[3rem_1fr] gap-x-2 border-t border-border/70 py-5"
							>
								<span className="pt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
									{step.index}
								</span>
								<div>
									<h3 className="font-medium text-foreground">{step.title}</h3>
									<p className="mt-1 text-sm text-muted-foreground text-pretty">
										{step.body}
									</p>
								</div>
							</li>
						))}
					</ol>
					<div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
						<CopyPromptButton />
						<a
							href={`${DOCS_ORIGIN}/quickstart`}
							target="_blank"
							rel="noreferrer"
							className="text-sm text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors duration-100 hover:text-foreground"
						>
							Or read the quickstart
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
