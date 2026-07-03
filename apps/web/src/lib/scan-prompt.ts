// The extractor prompt served at GET /scan/prompt and shown on the /scan
// landing page. Mirrors .agents/skills/codebase-scan/SKILL.md — keep in sync.
// Agent-agnostic: paste into any coding agent (Claude Code, Cursor, …).

export const SCAN_ENDPOINT = "https://api.foglamp.dev/scan";

export const SCAN_PROMPT = `Analyze THIS repository and publish a shareable "codebase scan" to foglamp —
a map of how the codebase works and how it uses AI. You produce only the data
(a small JSON object); a fixed renderer draws the scan. Write no HTML or CSS.

## Steps
1. Investigate the repo and build the JSON below. Write it to .foglamp/scan.json.
2. Tell the user plainly: "This uploads a high-level summary of your architecture
   (models, tools, integrations, and main flows — no code or secrets) to
   foglamp.dev and creates a public, unlisted link." Continue only if they agree.
3. Upload it (see "Publish") and capture the JSON response.
4. Save the response to .foglamp/scan.lock.json (so a later run updates the same
   URL). Make sure .foglamp/ is gitignored — the edit token is a secret.
5. Open the returned url and give it to the user.

## How to investigate
- Find where AI runs: generateText / streamText / generateObject / streamObject,
  @ai-sdk/* providers, agent loops, tool definitions (tool({...})).
- Identify the models and their provider (OpenAI, Anthropic, Google, …).
- Identify tools models can call (Exa, Firecrawl, Parallel, DB queries, internal
  functions) and external integrations/services.
- Map the main flows: entry points (routes, webhooks, pages, CLIs), scheduled jobs
  (crons/queues/workers), the agents, the models/tools they use, and the
  datastores/services they read and write.

## Output contract — write EXACTLY this shape to .foglamp/scan.json
{
  "version": 1,
  "project": {
    "name": "string (<=48)",
    "slug": "lowercase-dashed (<=48)",
    "tagline": "one line (<=80, optional)",
    "iconDomain": "favicon domain for the project, e.g. acme.com (optional)",
    "date": "YYYY-MM-DD"
  },
  "stats": { "agents": 0, "models": 0, "tools": 0, "integrations": 0 },
  "topModels":       [ { "id": "gpt-4o", "label": "GPT-4o", "domain": "openai.com" } ],
  "topTools":        [ { "id": "exa", "label": "Exa", "domain": "exa.ai" } ],
  "topIntegrations": [ { "id": "stripe", "label": "Stripe", "domain": "stripe.com" } ],
  "graph": {
    "nodes": [
      { "id": "chat", "label": "Dashboard chat", "kind": "entry", "sub": "/api/chat" },
      { "id": "agent", "label": "Support agent", "kind": "agent", "sub": "streamText",
        "detail": "src/agents/support.ts — answers tickets with order lookups (<=200, optional)" },
      { "id": "gpt4o", "label": "GPT-4o", "kind": "model", "domain": "openai.com" }
    ],
    "edges": [ { "from": "chat", "to": "agent" }, { "from": "agent", "to": "gpt4o", "label": "calls" } ]
  }
}

## Rules (these keep every scan consistent — do not break them)
- Caps: topModels <= 3, topTools <= 10, topIntegrations <= 10, graph.nodes <= 24,
  graph.edges <= 48. Aim for 14-22 nodes on a substantial codebase — the map
  should feel rich, not sparse.
- Give every distinct agent its OWN node when there are <= 10 agents; only
  merge agents into one node when they are numerous and near-identical (then
  say so in sub, e.g. "12 near-identical scrapers"). Chain agents with
  agent->agent edges when one feeds the next.
- group (optional, <=24): tag sequential pipeline stages with a shared group
  name (e.g. "Setup pipeline") — those nodes render as one labeled vertical
  stack, keeping deep chains compact. Use 2-3 groups of 3-6 nodes for long
  pipelines; leave hub-and-spoke nodes ungrouped.
- Node labels <= 28 chars, sub <= 40, edge labels <= 24.
- kind is one of: entry (trigger/route/page/CLI), cron (scheduled job), agent,
  model, tool, store (DB/cache/index), external (3rd-party API).
- domain is a favicon domain with no scheme (openai.com, anthropic.com, exa.ai,
  clickhouse.com). Add it to anything a recognizable company/product owns; omit it
  for purely internal nodes (entries, crons, internal tools). Use the product
  domain for models (gemini.google.com for Gemini, claude.ai for Claude).
- detail (optional, <=200) is shown when a node is clicked — the file path plus
  one sentence of what it does is ideal.
- Every edge's from/to must reference an existing node id; ids unique.
- Use today's date for project.date.

## Publish
First run (no .foglamp/scan.lock.json):
  curl -sS -X POST ${SCAN_ENDPOINT} \\
    -H 'content-type: application/json' --data @.foglamp/scan.json

Update run (a .foglamp/scan.lock.json exists) — keep the same URL:
  jq -n --slurpfile d .foglamp/scan.json \\
        --arg t "$(jq -r .editToken .foglamp/scan.lock.json)" \\
        '{data: $d[0], editToken: $t}' \\
  | curl -sS -X POST ${SCAN_ENDPOINT} \\
      -H 'content-type: application/json' --data @-

The response is JSON: { "slug", "url", "editToken", "expiresAt" }. Save it to
.foglamp/scan.lock.json, then open url. On a 422 error, fix .foglamp/scan.json
to satisfy the rules and retry.
`;
