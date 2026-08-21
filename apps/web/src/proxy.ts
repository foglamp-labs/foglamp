import { NextResponse, type NextRequest } from "next/server";

import { negotiateFormat } from "@/lib/accept";
import {
	getMarkdownPage,
	markdownNotFound,
} from "@/lib/markdown-pages";

// Markdown content negotiation for the marketing surface (acceptmarkdown.com).
// Agents that ask for `Accept: text/markdown` (or fetch `<path>.md`) get a
// markdown representation of the page; browsers are untouched. Both variants
// of a negotiated URL carry `Vary: Accept` so CDNs never serve the cached HTML
// to an agent or vice versa. Unknown paths asked for as markdown get a
// markdown 404 that points at llms.txt / sitemap / docs so agents can recover.

// Routes that are real pages but have no markdown mirror: the authenticated
// dashboard, auth flows, and interactive tools. Requests here pass through
// untouched (mirrors the disallow list in robots.ts).
const NON_MARKETING_PREFIXES = [
	"/overview",
	"/agents",
	"/alerts",
	"/evals",
	"/platform",
	"/sessions",
	"/settings",
	"/traces",
	"/workflows",
	"/login",
	"/device",
	"/reset-password",
	"/accept-invitation",
	"/scan",
	"/setup",
	"/hud",
	"/buttons",
];

function isNonMarketing(pathname: string): boolean {
	return NON_MARKETING_PREFIXES.some(
		(p) => pathname === p || pathname.startsWith(`${p}/`),
	);
}

function markdownResponse(body: string, status: 200 | 404 | 406): Response {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"cache-control": "public, max-age=0, must-revalidate",
			vary: "Accept",
		},
	});
}

export function proxy(request: NextRequest): Response {
	const { pathname } = request.nextUrl;

	// `<path>.md` aliases always serve markdown, whatever the Accept header
	// (mirrors how docs.foglamp.dev exposes its .md variants).
	if (pathname.endsWith(".md")) {
		const target = pathname.slice(0, -3) || "/";
		const page = getMarkdownPage(target);
		return page
			? markdownResponse(page, 200)
			: markdownResponse(markdownNotFound(pathname), 404);
	}

	// Next's own client-router traffic (RSC payloads, prefetches) negotiates
	// with internal content types — never markdown. Leave it completely alone
	// so the router cache behaves exactly as before.
	if (
		request.headers.get("rsc") !== null ||
		request.headers.get("next-router-state-tree") !== null ||
		request.headers.get("accept")?.includes("text/x-component")
	) {
		return NextResponse.next();
	}

	const format = negotiateFormat(request.headers.get("accept"));
	const page = getMarkdownPage(pathname);

	if (format === "markdown") {
		if (page) return markdownResponse(page, 200);
		// Real (non-marketing) pages just have no markdown variant — serve HTML.
		if (isNonMarketing(pathname)) return NextResponse.next();
		return markdownResponse(markdownNotFound(pathname), 404);
	}

	if (format === "unacceptable" && page) {
		return markdownResponse(
			`# 406 — Not acceptable\n\nThis URL serves \`text/html\` and \`text/markdown\`. Re-request with one of those in the Accept header.\n`,
			406,
		);
	}

	// HTML variant of a negotiated URL: ask for Vary: Accept so shared caches
	// key on Accept here too. The Next server strips middleware Vary values
	// from page responses, so the load-bearing copy of this header lives in
	// next.config.ts `headers()` — Vercel's edge router applies that one from
	// the routes manifest. This append is kept for self-hosted setups behind
	// proxies that do honor middleware headers.
	if (page) {
		const response = NextResponse.next();
		response.headers.append("vary", "Accept");
		return response;
	}

	return NextResponse.next();
}

export const config = {
	// Everything except the API, Next internals, and static assets by
	// extension — but let `.md` through for the markdown aliases.
	matcher: [
		"/((?!api/|_next/|.*\\.(?:ico|png|jpe?g|svg|webp|avif|gif|css|js|map|txt|xml|json|woff2?|ttf|otf)$).*)",
	],
};
