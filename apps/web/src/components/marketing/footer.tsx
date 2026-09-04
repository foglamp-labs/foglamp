import type { Route } from "next";
import Link from "next/link";

import { ThemeSwitcher } from "@/components/theme-switcher";
import { DOCS_ORIGIN, GITHUB_URL } from "@/lib/links";

import { CuttingMat } from "./cutting-mat";
import { GithubLogo } from "./github-logo";
import { Logo } from "./logo";
import { products } from "./products";

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { heading: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
	{
		heading: "Product",
		links: [
			...products.map((p) => ({ label: p.label, href: p.href })),
			{ label: "Pricing", href: "/pricing" },
		],
	},
	{
		heading: "Labs",
		links: [
			{ label: "Scan", href: "/scan" },
			{ label: "HUD", href: "/hud" },
		],
	},
	{
		heading: "Resources",
		links: [
			{ label: "Docs", href: DOCS_ORIGIN, external: true },
			{ label: "Quickstart", href: `${DOCS_ORIGIN}/quickstart`, external: true },
			{ label: "Self-hosting", href: `${DOCS_ORIGIN}/self-hosting`, external: true },
			{ label: "Changelog", href: `${DOCS_ORIGIN}/changelog`, external: true },
			{ label: "GitHub", href: GITHUB_URL, external: true },
		],
	},
	{
		heading: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Privacy", href: "/privacy" },
			{ label: "Terms", href: "/terms" },
		],
	},
];

const LINK_CLASS =
	"text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground";

function FooterAnchor({ link }: { link: FooterLink }) {
	if (link.external) {
		return (
			<a href={link.href} className={LINK_CLASS} rel="noreferrer">
				{link.label}
			</a>
		);
	}
	return (
		<Link href={link.href as Route} className={LINK_CLASS}>
			{link.label}
		</Link>
	);
}

/** Brazilian flag glyph for the "Made in Brazil" mark. Decorative, so the
 * adjacent text labels it. */
function BrazilFlag({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 32 32"
			className={className}
			aria-hidden="true"
		>
			<rect x="1" y="4" width="30" height="24" rx="4" ry="4" fill="#459a45" />
			<path
				d="M27,4H5c-2.209,0-4,1.791-4,4V24c0,2.209,1.791,4,4,4H27c2.209,0,4-1.791,4-4V8c0-2.209-1.791-4-4-4Zm3,20c0,1.654-1.346,3-3,3H5c-1.654,0-3-1.346-3-3V8c0-1.654,1.346-3,3-3H27c1.654,0,3,1.346,3,3V24Z"
				opacity=".15"
			/>
			<path d="M3.472,16l12.528,8,12.528-8-12.528-8L3.472,16Z" fill="#fedf00" />
			<circle cx="16" cy="16" r="5" fill="#0a2172" />
			<path
				d="M14,14.5c-.997,0-1.958,.149-2.873,.409-.078,.35-.126,.71-.127,1.083,.944-.315,1.951-.493,2.999-.493,2.524,0,4.816,.996,6.519,2.608,.152-.326,.276-.666,.356-1.026-1.844-1.604-4.245-2.583-6.875-2.583Z"
				fill="#fff"
			/>
			<path
				d="M27,5H5c-1.657,0-3,1.343-3,3v1c0-1.657,1.343-3,3-3H27c1.657,0,3,1.343,3,3v-1c0-1.657-1.343-3-3-3Z"
				fill="#fff"
				opacity=".2"
			/>
		</svg>
	);
}

// A small rubber stamp for where the product is made. Brand orange, a touch
// rotated, so it reads as inked rather than typeset.
function CuritibaStamp() {
	return (
		<svg
			viewBox="0 0 104 44"
			className="h-9 w-auto -rotate-3 text-[#FF5513] opacity-80"
			aria-label="Curitiba, 2026"
			role="img"
		>
			<rect
				x="1.5"
				y="1.5"
				width="101"
				height="41"
				rx="4"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<text
				x="52"
				y="20"
				textAnchor="middle"
				fill="currentColor"
				fontSize="11"
				fontWeight="700"
				letterSpacing="2.2"
				className="font-mono"
			>
				CURITIBA
			</text>
			<text
				x="52"
				y="35"
				textAnchor="middle"
				fill="currentColor"
				fontSize="10"
				fontWeight="600"
				letterSpacing="1"
				className="font-mono"
			>
				&rsquo;26
			</text>
		</svg>
	);
}

export function MarketingFooter() {
	return (
		<footer className="relative isolate overflow-hidden border-t border-border/50 bg-background">
			<div className="relative z-10 mx-auto max-w-7xl px-5 pt-16 sm:px-8">
				<div className="grid grid-cols-2 gap-10 lg:grid-cols-[1.6fr_repeat(4,1fr)]">
					<div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
						<Logo />
						<p className="max-w-xs text-sm text-muted-foreground">
							The missing observability layer for AI agents.
						</p>
						<a
							href={GITHUB_URL}
							aria-label="Foglamp on GitHub"
							className="mt-2 w-fit text-muted-foreground transition-colors duration-100 hover:text-foreground"
						>
							<GithubLogo className="size-4" />
						</a>
					</div>
					{COLUMNS.map((col) => (
						<div key={col.heading} className="flex flex-col gap-3">
							<h3 className="text-sm font-medium tracking-wide text-foreground">
								{col.heading}
							</h3>
							<ul className="flex flex-col gap-2.5">
								{col.links.map((link) => (
									<li key={link.label}>
										<FooterAnchor link={link} />
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border/50 py-6">
					<ThemeSwitcher />
					<p className="text-xs text-muted-foreground">
						&copy; {new Date().getFullYear()} Foglamp
					</p>
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						Made in
						<BrazilFlag className="size-4" />
					</span>
					<span className="ml-auto">
						<CuritibaStamp />
					</span>
				</div>
			</div>

			{/* The artistic ending: the brand mark as dashed cutting-mat guides,
          bleeding off the bottom of the page. */}
			<CuttingMat />
		</footer>
	);
}
