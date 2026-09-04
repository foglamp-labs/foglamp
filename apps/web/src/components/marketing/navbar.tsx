"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { DOCS_ORIGIN, GITHUB_URL } from "@/lib/links";

import { GithubLogo } from "./github-logo";
import { Logo } from "./logo";

// Flat navigation, no menus: the two side projects, then pricing and docs.
// Everything sits on the right, flush against the account buttons, so the bar
// reads as one row instead of a centered cluster and a detached CTA.
const NAV_LINKS: { label: string; href: Route | string; external?: boolean }[] =
	[
		{ label: "Scan", href: "/scan" },
		{ label: "HUD", href: "/hud" },
		{ label: "Pricing", href: "/pricing" },
		{ label: "Docs", href: DOCS_ORIGIN, external: true },
	];

const LINK_CLASS =
	"text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground";

function NavLink({ link }: { link: (typeof NAV_LINKS)[number] }) {
	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noreferrer"
				className={LINK_CLASS}
			>
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

export function MarketingNavbar() {
	// Swap the account buttons for logged-in visitors. The marketing pages are
	// public, so a signed-in user landing here (e.g. via /homepage) gets a
	// single "Dashboard" button instead of log in + start free.
	const { data: session } = authClient.useSession();
	const loggedIn = Boolean(session?.user);
	const router = useRouter();

	// The bottom hairline only appears once the page has scrolled under the
	// bar. At the top the header sits flush with the page.
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		function onScroll() {
			setScrolled(window.scrollY > 0);
		}
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	// Press "L" to jump to login. Only active for logged-out visitors. Ignored
	// while typing in a field so it never hijacks input.
	useEffect(() => {
		if (loggedIn) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "l" || e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (
				t?.isContentEditable ||
				t?.tagName === "INPUT" ||
				t?.tagName === "TEXTAREA" ||
				t?.tagName === "SELECT"
			)
				return;
			e.preventDefault();
			router.push("/login");
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [loggedIn, router]);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 border-b bg-background/70 backdrop-blur-sm transition-colors duration-200",
				scrolled ? "border-border/50" : "border-transparent",
			)}
		>
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
				<Link
					href="/homepage"
					aria-label="Foglamp home"
					className="flex items-center transition-opacity hover:opacity-80"
				>
					<Logo />
				</Link>

				<div className="flex items-center gap-6">
					<nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
						{NAV_LINKS.map((link) => (
							<NavLink key={link.label} link={link} />
						))}
					</nav>

					<div className={cn("flex items-center gap-2.5")}>
						{/* Open-source signal: the same GitHub link as the footer, next to
                the account buttons. Icon-only to stay compact. */}
						<Button
							variant="ghost"
							aria-label="Foglamp on GitHub"
							className="size-7.5"
							render={
								<a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" />
							}
						>
							<GithubLogo className="size-4.5" />
						</Button>
						{loggedIn ? (
							<Button render={<Link href="/overview" />} className="h-7.5">
								Dashboard
							</Button>
						) : (
							<>
								<Button
									variant="secondary"
									render={<Link href="/login" />}
									className="h-7.5"
								>
									Log in
								</Button>
								<Button render={<Link href="/login" />} className="h-7.5">
									Start free
								</Button>
							</>
						)}
					</div>
				</div>
			</div>
		</header>
	);
}
