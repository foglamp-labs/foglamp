import { DOCS_ORIGIN, GITHUB_URL, SITE_URL } from "@/lib/links";

// Markdown representations of the marketing pages, served to agents via
// `Accept: text/markdown` content negotiation (acceptmarkdown.com) and at the
// `<path>.md` aliases — see proxy.ts. Hand-written mirrors of the React pages:
// keep the facts (taglines, plan limits, links) in sync when those change.
// The full documentation already has auto-generated .md mirrors on
// docs.foglamp.dev; this covers the marketing surface on foglamp.dev itself.

const FOOTER = `

---

- Docs: ${DOCS_ORIGIN} (markdown mirrors at \`<page>.md\`, index at ${DOCS_ORIGIN}/llms.txt)
- LLM index for this site: ${SITE_URL}/llms.txt
- OpenAPI spec (ingest API): ${DOCS_ORIGIN}/api-reference/openapi.json
- Source: ${GITHUB_URL} (Apache-2.0, self-hostable)`;

const HOME = `# Foglamp — Observability for AI agents

> The missing observability layer for the Vercel AI SDK. Two lines of code and
> an API key give you costs, latency, token usage, distributed traces, evals,
> and alerts for every generateText / streamText call — across every model your
> AI agents use. Open source (Apache 2.0) and self-hostable.

## What you get

- **Cost intelligence** (${SITE_URL}/features/cost-intelligence): know exactly what every call costs, by model, agent, customer.
- **Distributed traces** (${SITE_URL}/features/distributed-traces): waterfall every run, with the exact prompt and response per span.
- **Evals** (${SITE_URL}/features/evals): score production traffic with code checks and LLM judges.
- **Alerts** (${SITE_URL}/features/alerts): threshold rules on cost, latency, and error rate.
- **Agents** (${SITE_URL}/features/agents): per-agent spans, latency, and spend — with the full call flow.
- **SDK** (${SITE_URL}/features/sdk): two lines instruments every generateText / streamText call.

## Get started

1. Quickstart: ${DOCS_ORIGIN}/quickstart
2. Agent-oriented setup guide (paste into your coding agent): ${DOCS_ORIGIN}/ai-instrument.md
3. Pricing (Free / Pro $49/mo / Enterprise): ${SITE_URL}/pricing`;

const PRICING = `# Foglamp pricing

Usage-based plans for AI observability. All plans include unlimited agents,
workflows, traces & sessions, and team members.

| Plan | Price | Spans / month | Retention | Projects | Alerts | Evals |
| --- | --- | --- | --- | --- | --- | --- |
| Free | $0 forever | 10,000 | 3 days | 1 | 1 | 5 |
| Pro | $49 / month | 1,000,000 | 14 days | 5 | 10 | 20 |
| Enterprise | Custom | Custom | 90+ days | Custom | Custom | Custom |

- **Free** — everything you need to instrument your first agent. Sign up: ${SITE_URL}/login
- **Pro** — production-grade observability for growing teams. Adds the Foggy AI assistant, email & Slack alerting, and priority support.
- **Enterprise** — custom limits and controls for scale. Adds SSO/SAML, audit logs, dedicated support & SLA. Contact: sales@foglamp.dev

Foglamp is also open source (Apache-2.0) and free to self-host: ${GITHUB_URL}`;

const ABOUT = `# About Foglamp

Foglamp builds observability for AI agents: the tooling that shows what your
LLM calls actually cost, how they behave, and when their quality drifts.

## Founders

- **Gustavo Fior** — co-founder & builder. Leads product and engineering, building the tools he wants when shipping AI products himself. (https://www.linkedin.com/in/gustavofior)
- **Abdul Haidar** — co-founder, working alongside Gustavo to build clearer infrastructure for AI products. (https://www.linkedin.com/in/abdulhdr/)

Founded 2026. Open source at ${GITHUB_URL}.`;

const PRIVACY = `# Foglamp privacy policy

The canonical, always-current privacy policy is the HTML page at
${SITE_URL}/privacy — fetch it without an \`Accept: text/markdown\` header (or
render it) to read the full legal text. Questions: privacy@foglamp.dev.`;

const TERMS = `# Foglamp terms of service

The canonical, always-current terms are the HTML page at ${SITE_URL}/terms —
fetch it without an \`Accept: text/markdown\` header (or render it) to read the
full legal text. Questions: legal@foglamp.dev.`;

// One markdown mirror per feature page: the product tagline plus where to go
// deeper. Taglines mirror components/marketing/products.ts.
function feature(title: string, tagline: string, extra: string): string {
	return `# ${title} — Foglamp

> ${tagline}

${extra}

Part of Foglamp, observability for AI agents built on the Vercel AI SDK.
Overview: ${SITE_URL} · Pricing: ${SITE_URL}/pricing · Docs: ${DOCS_ORIGIN}`;
}

const PAGES: Record<string, string> = {
	"/": HOME,
	"/homepage": HOME,
	"/pricing": PRICING,
	"/about": ABOUT,
	"/privacy": PRIVACY,
	"/terms": TERMS,
	"/features/cost-intelligence": feature(
		"Cost intelligence",
		"Know exactly what every call costs, by model, agent, customer.",
		`Every span is priced at ingest against a per-model pricing table (with
per-project overrides), so spend rolls up by model, agent, workflow, and
customer without any extra tagging.`,
	),
	"/features/evals": feature(
		"Evals",
		"Score production traffic with code checks and LLM judges.",
		`Run code scorers and LLM-as-judge evals against live traces — no separate
eval dataset required. Docs: ${DOCS_ORIGIN}/dashboard/evals`,
	),
	"/features/alerts": feature(
		"Alerts",
		"Threshold rules on cost, latency, error rate, and eval pass rate.",
		`Set threshold rules, monitor their current value and history, and get
notified by email or Slack when a metric crosses the line. Docs: ${DOCS_ORIGIN}/dashboard/alerts`,
	),
	"/features/agents": feature(
		"Agents",
		"Per-agent spans, latency, and spend - with the full call flow.",
		`Group traces by agent to see each one's spans, latency, and spend, and
drill into the full call flow behind any run.`,
	),
	"/features/distributed-traces": feature(
		"Distributed traces",
		"Waterfall every run, with the exact prompt and response per span.",
		`Every generateText / streamText call becomes a span in a waterfall, with
the exact prompt, response, token counts, and cost attached.`,
	),
	"/features/sdk": feature(
		"SDK",
		"Two lines instruments every generateText / streamText call.",
		`Wrap your AI SDK model (v4–v7) and every call is traced automatically.
Setup guide written for coding agents: ${DOCS_ORIGIN}/ai-instrument.md`,
	),
};

/** Full markdown document for a marketing path, or null when none exists. */
export function getMarkdownPage(pathname: string): string | null {
	const normalized =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	const body = PAGES[normalized];
	return body ? `${body}${FOOTER}\n` : null;
}

/** All paths that have a markdown representation (for tests + sitemap checks). */
export function markdownPagePaths(): string[] {
	return Object.keys(PAGES);
}

/** Markdown body for a 404, pointing agents at ways to recover. */
export function markdownNotFound(pathname: string): string {
	return `# 404 — Not found

There is no page at \`${pathname}\` on ${SITE_URL}.

Where to look instead:

- Site index for LLMs: ${SITE_URL}/llms.txt
- Sitemap: ${SITE_URL}/sitemap.xml
- Documentation: ${DOCS_ORIGIN} (index: ${DOCS_ORIGIN}/llms.txt)
- Product overview: ${SITE_URL}
${FOOTER}\n`;
}
