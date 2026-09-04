import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { DOCS_ORIGIN, GITHUB_URL } from "@/lib/links";

import { PassRateCurve, SpanWaterfall, SpendDial } from "./schematics";

// Problems, not features. Three beats, each a hairline with a numbered mono
// label, a headline, two sentences, a link to the feature page, and a
// schematic. The schematics are static line drawings (see schematics.tsx),
// so the section stays light next to the live demo in the hero.

type Beat = {
	index: string;
	name: string;
	title: string;
	body: string;
	link: { label: string; href: Route };
	figure: ReactNode;
	caption: string;
};

const BEATS: Beat[] = [
	{
		index: "01",
		name: "Money",
		title: "The bill is how you find out.",
		body: "Foglamp prices every call at ingest and rolls it up by model, agent, and customer. Set a threshold and get told before the invoice does.",
		link: { label: "Cost intelligence", href: "/features/cost-intelligence" },
		figure: <SpendDial className="w-full" />,
		caption: "Fig. 02. Daily spend against an alert threshold.",
	},
	{
		index: "02",
		name: "Time",
		title: "The 2am reconstruction.",
		body: "One trace holds every span of a run: the tools, the model calls, the exact prompt and the exact response. You read what happened instead of guessing.",
		link: { label: "Distributed traces", href: "/features/distributed-traces" },
		figure: <SpanWaterfall className="w-full" />,
		caption: "Fig. 03. One trace, five spans, one slow model call.",
	},
	{
		index: "03",
		name: "Safety",
		title: "The regression nobody saw.",
		body: "Evals score real traffic with code checks and LLM judges. When the pass rate slips under your line, an alert fires the same day, not the next quarter.",
		link: { label: "Evals", href: "/features/evals" },
		figure: <PassRateCurve className="w-full" />,
		caption: "Fig. 04. Pass rate over two weeks, crossing the alert line.",
	},
];

function HairlineLabel({ index, name }: { index: string; name: string }) {
	return (
		<div className="flex items-center gap-4">
			<span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
				<span className="text-muted-foreground/60">{index}</span>{" "}
				<span className="text-foreground">{name}</span>
			</span>
			<span aria-hidden className="h-px flex-1 bg-border/70" />
		</div>
	);
}

const TEXT_LINK =
	"text-sm text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors duration-100 hover:decoration-foreground";

export function Problems() {
	return (
		<section className="mx-auto mt-32 w-full max-w-7xl px-5 sm:mt-40 sm:px-8">
			<header className="max-w-2xl">
				<h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
					What you stop worrying about.
				</h2>
				<p className="mt-3 max-w-md text-muted-foreground text-pretty">
					Foglamp exists for three problems. Money, time, and safety.
				</p>
			</header>

			<ol className="mt-16 flex flex-col gap-16 sm:gap-20">
				{BEATS.map((beat) => (
					<li key={beat.index} className="flex flex-col gap-8">
						<HairlineLabel index={beat.index} name={beat.name} />
						<div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
							<div className="max-w-md">
								<h3 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
									{beat.title}
								</h3>
								<p className="mt-4 text-muted-foreground text-pretty">{beat.body}</p>
								<Link href={beat.link.href} className={`mt-6 inline-block ${TEXT_LINK}`}>
									{beat.link.label}
								</Link>
							</div>
							<figure className="m-0 w-full max-w-md text-muted-foreground lg:ml-auto">
								{beat.figure}
								<figcaption className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
									{beat.caption}
								</figcaption>
							</figure>
						</div>
					</li>
				))}
			</ol>

			<p className="mt-20 font-display text-3xl font-semibold tracking-tight text-balance sm:mt-24 sm:text-4xl">
				So you can ship on a Friday.
			</p>

			{/* Open source, one hairline row. Belongs with safety: you can read the
          code and you can keep the data. */}
			<div className="mt-16 flex flex-col gap-6 sm:mt-20">
				<HairlineLabel index="04" name="Open source" />
				<div className="grid gap-6 lg:grid-cols-2 lg:gap-20">
					<p className="max-w-md text-muted-foreground text-pretty">
						Apache 2.0, the whole thing. Run the cloud version, or self-host with
						one docker compose file and keep every prompt on your own machines.
					</p>
					<div className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end">
						<a href={GITHUB_URL} target="_blank" rel="noreferrer" className={TEXT_LINK}>
							GitHub
						</a>
						<a
							href={`${DOCS_ORIGIN}/self-hosting`}
							target="_blank"
							rel="noreferrer"
							className={TEXT_LINK}
						>
							Self-hosting guide
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
