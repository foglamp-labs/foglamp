import { DOCS_ORIGIN, GITHUB_URL, SITE_URL } from "@/lib/links";

// Marketing-domain llms.txt (https://llmstxt.org). The full, agent-oriented
// documentation lives on docs.foglamp.dev — Mintlify auto-generates its own
// llms.txt + .md mirrors there. This file is the index an LLM or coding agent
// finds when it lands on foglamp.dev itself: a short orientation plus links to
// the canonical resources (agent-instrumentation guide, docs, pricing, repo).
//
// Served via a Route Handler at /llms.txt. force-static so it's emitted as a
// plain file at build time (no per-request work).
export const dynamic = "force-static";

const BODY = `# Foglamp

> The missing observability layer for the Vercel AI SDK. Two lines of code and an
> API key give you costs, latency, token usage, distributed traces, evals, and
> alerts for every generateText / streamText call — across every model your AI
> agents use. Open source (Apache 2.0) and self-hostable.

## Get started
- [Instrument your app (written for coding agents)](${DOCS_ORIGIN}/ai-instrument.md): version-aware setup for Vercel AI SDK v4–v7, with agent / workflow / session mapping rules and verification steps.
- [Quickstart](${DOCS_ORIGIN}/quickstart): install the SDK, add an API key, and see your first trace.
- [Full docs index for LLMs](${DOCS_ORIGIN}/llms.txt): the complete machine-readable documentation tree.

## Product
- [Overview](${SITE_URL}): what Foglamp is and who it's for.
- [Pricing](${SITE_URL}/pricing): usage-based plans — Free ($0), Pro ($49/mo), and Enterprise (custom).
- [Distributed traces](${SITE_URL}/features/distributed-traces): waterfall every run down to the token, with the exact prompt and response per span.
- [Cost intelligence](${SITE_URL}/features/cost-intelligence): spend broken down by model, agent, and customer.
- [Evals](${SITE_URL}/features/evals): score production traffic with code checks and LLM judges.
- [Agents](${SITE_URL}/features/agents): per-agent spans, latency, and spend with the full call flow.
- [Alerts](${SITE_URL}/features/alerts): threshold rules on cost, latency, and error rate.
- [SDK](${SITE_URL}/features/sdk): two lines instrument every generateText / streamText call.

## Reference
- [API reference (OpenAPI)](${DOCS_ORIGIN}/api-reference/openapi.json): machine-readable API specification.
- [Source code](${GITHUB_URL}): GitHub repository (Apache 2.0).
`;

export function GET() {
	return new Response(BODY, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=0, s-maxage=86400",
		},
	});
}
