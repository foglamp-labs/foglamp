import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/links";

// Crawl policy for foglamp.dev. The marketing surface should be fully indexable
// by classic search crawlers *and* AI/answer engines (GEO) — so we keep the
// default `*` rule permissive and don't block GPTBot/ClaudeBot/PerplexityBot &
// co. We only fence off the authenticated dashboard and auth flows, which carry
// no SEO value and would just be redirect/login walls to a crawler.
export default function robots(): MetadataRoute.Robots {
	const appRoutes = [
		"/overview",
		"/agents",
		"/alerts",
		"/evals",
		"/platform",
		"/sessions",
		"/settings",
		"/traces",
		"/workflows",
	];
	const authRoutes = [
		"/login",
		"/device",
		"/reset-password",
		"/accept-invitation/",
	];

	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: [...appRoutes, ...authRoutes],
		},
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
