import type { Metadata, Route } from "next";
import Link from "next/link";

import { DOCS_ORIGIN } from "@/lib/links";

export const metadata: Metadata = {
	title: "Page not found",
};

// Global 404. Rendered with a real 404 status; the body doubles as a recovery
// map for agents and crawlers (home, docs, llms.txt, sitemap) instead of a
// bare app shell. Agents that ask for `Accept: text/markdown` get the markdown
// equivalent straight from proxy.ts and never reach this component.
export default function NotFound() {
	const links = [
		{ label: "Homepage", href: "/" },
		{ label: "Pricing", href: "/pricing" },
		{ label: "Documentation", href: DOCS_ORIGIN, external: true },
		{ label: "llms.txt (site index for LLMs)", href: "/llms.txt" },
		{ label: "sitemap.xml", href: "/sitemap.xml" },
	];

	return (
		<div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-24">
			<p className="font-mono text-sm text-muted-foreground">404</p>
			<h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				Page not found
			</h1>
			<p className="mt-3 max-w-md text-center text-balance text-muted-foreground">
				There&apos;s no page at this address. Here&apos;s where to look
				instead:
			</p>
			<ul className="mt-8 flex flex-col items-center gap-2">
				{links.map((l) => (
					<li key={l.href}>
						{l.external ? (
							<a
								href={l.href}
								className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
							>
								{l.label}
							</a>
						) : (
							<Link
								href={l.href as Route}
								className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
							>
								{l.label}
							</Link>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
