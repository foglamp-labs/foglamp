import { IconArrowUpRight, IconBrandLinkedin } from "@tabler/icons-react";
import type { Metadata } from "next";
import Image from "next/image";

import { SITE_URL } from "@/lib/links";

const LINKEDIN_URL = "https://www.linkedin.com/in/gustavofior";
const ABDUL_LINKEDIN_URL = "https://www.linkedin.com/in/abdulhdr/";

const founders = [
	{
		name: "Gustavo Fior",
		role: "Co-founder & builder",
		image: "/avatar.jpg",
		linkedin: LINKEDIN_URL,
		bio: "Gustavo leads product and engineering at Foglamp, building the tools he wants when shipping AI products himself.",
	},
	{
		name: "Abdul Haidar",
		role: "Co-founder",
		image: "/abdul-haidar.jpg",
		linkedin: ABDUL_LINKEDIN_URL,
		bio: "Abdul is a co-founder of Foglamp, working alongside Gustavo to build clearer infrastructure for AI products.",
	},
] as const;

export const metadata: Metadata = {
	title: "About",
	description:
		"The story behind Foglamp and the people building observability for AI agents.",
	alternates: { canonical: "/about" },
};

const organizationJsonLd = {
	"@context": "https://schema.org",
	"@type": "Organization",
	name: "Foglamp",
	url: SITE_URL,
	foundingDate: "2026",
	foundingLocation: {
		"@type": "Place",
		name: "Curitiba, Brazil",
	},
	founder: founders.map((founder) => ({
		"@type": "Person",
		name: founder.name,
		url: founder.linkedin,
	})),
	sameAs: [
		LINKEDIN_URL,
		ABDUL_LINKEDIN_URL,
		"https://github.com/foglamp-labs/foglamp",
	],
};

export default function AboutPage() {
	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c"),
				}}
			/>

			<div className="relative isolate overflow-hidden">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-120 overflow-hidden"
				>
					<div className="absolute left-[8%] top-12 size-64 rounded-full bg-blue-500/7 blur-3xl dark:bg-blue-400/5" />
					<div className="absolute right-[6%] top-0 size-72 rounded-full bg-orange-500/7 blur-3xl dark:bg-orange-400/5" />
					<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border to-transparent" />
				</div>

				<div className="mx-auto max-w-5xl px-5 pb-28 pt-24 sm:px-8 sm:pb-36 sm:pt-32">
					<header className="max-w-3xl">
						<p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
							Curitiba, Brazil · Est. 2026
						</p>
						<h1 className="font-display text-5xl font-medium tracking-[-0.045em] text-foreground sm:text-7xl">
							Helping builders see what their AI is doing.
						</h1>
					</header>

					<section
						aria-labelledby="our-story"
						className="mt-20 grid gap-8 border-t border-border pt-10 sm:mt-28 sm:grid-cols-[1fr_2fr] sm:gap-16 sm:pt-14"
					>
						<h2
							id="our-story"
							className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
						>
							Our story
						</h2>
						<div className="space-y-6 text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
							<p className="text-foreground">
								Foglamp was founded in 2026 in Curitiba, Brazil, to make AI
								agents easier to understand, debug, and operate.
							</p>
							<p>
								As agents grew from a single model call into workflows of models,
								tools, and handoffs, the usual application logs stopped telling the
								whole story. Foglamp was built to close that gap: one place to see
								traces, latency, token usage, costs, and evaluations across the full
								run.
							</p>
							<p>
								Today, Foglamp is an open-source, self-hostable observability
								platform for teams building with the Vercel AI SDK. The goal is
								simple: give developers the clarity to ship capable agents with
								confidence.
							</p>
						</div>
					</section>

					<section aria-labelledby="team" className="mt-24 sm:mt-32">
						<div className="mb-8 flex items-end justify-between gap-8 border-b border-border pb-5">
							<h2
								id="team"
								className="font-display text-3xl font-medium tracking-[-0.035em] sm:text-4xl"
							>
								The team
							</h2>
							<span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
								Two founders
							</span>
						</div>

						<div className="divide-y divide-border">
							{founders.map((founder, index) => (
								<article
									key={founder.name}
									className="group grid items-center gap-7 py-9 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr_auto] sm:gap-10 sm:py-12"
								>
									<div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-(--custom-shadow) squircle:rounded-4xl corner-squircle">
										<Image
											src={founder.image}
											alt={`${founder.name}, co-founder of Foglamp`}
											fill
											sizes="(max-width: 640px) 100vw, 176px"
											className="object-cover grayscale transition duration-500 group-hover:grayscale-0"
											priority={index === 0}
										/>
									</div>

									<div>
										<h3 className="font-display text-3xl font-medium tracking-[-0.035em]">
											{founder.name}
										</h3>
										<p className="mt-1 text-sm font-medium text-muted-foreground">
											{founder.role}
										</p>
										<p className="mt-5 max-w-xl leading-7 text-muted-foreground">
											{founder.bio}
										</p>
									</div>

									<a
										href={founder.linkedin}
										target="_blank"
										rel="noreferrer noopener"
										aria-label={`${founder.name} on LinkedIn`}
										className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-(--custom-shadow) transition-colors hover:bg-accent sm:self-end"
									>
										<IconBrandLinkedin className="size-4" aria-hidden="true" />
										LinkedIn
										<IconArrowUpRight
											className="size-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
									</a>
								</article>
							))}
						</div>
					</section>
				</div>
			</div>
		</>
	);
}
