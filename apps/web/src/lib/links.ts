// Canonical external links shared across the marketing surface (navbar, hero,
// footer). Kept in one place so the GitHub repo URL can't drift — and so the
// "we're open source" links all point at the real repo.
export const GITHUB_URL = "https://github.com/foglamp-labs/foglamp";

// Canonical public origin for the marketing site, used to build absolute URLs
// for robots.ts, sitemap.ts, llms.txt, and JSON-LD. Mirrors the metadataBase in
// the root layout; override via NEXT_PUBLIC_SITE_URL when the domain changes.
export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ?? "https://foglamp.dev";

// Mintlify docs origin. The docs site auto-generates its own llms.txt + .md
// mirrors; we link into it from the marketing-domain llms.txt and agent prompts.
export const DOCS_ORIGIN = "https://docs.foglamp.dev";
