---
name: codebase-scan
description: Analyze a repository and publish a shareable foglamp codebase scan. Use when asked to "generate a codebase scan", "make a foglamp scan", "map how this repo uses AI", or "create a shareable architecture scan".
metadata:
  author: foglamp
  version: "2.1.0"
---

# Codebase Scan

Analyze the current repository, describe how it works and how it uses AI as a
small JSON object, then upload it to foglamp to get a **shareable link**
(`foglamp.dev/scan/<slug>`) that unfurls on socials. You produce only the
**data** — a fixed renderer draws the scan. Do not write any HTML or CSS.

## Steps

1. **Investigate** the repo (see "How to investigate" below) and build the JSON
   described in "Output contract". Write it to `.foglamp/scan.json`.
2. **Get consent.** Tell the user plainly: *"This uploads a high-level summary of
   your architecture (models, tools, integrations, and main flows — no code or
   secrets) to foglamp.dev and creates a public, unlisted link."* Only continue
   if they're OK with it.
3. **Upload** with `curl` (see "Publish"). Capture the JSON response.
4. **Save credentials** to `.foglamp/scan.lock.json` (so a later run updates the
   same URL instead of making a new one). Ensure `.foglamp/` is gitignored — the
   edit token is a secret.
5. **Open** the returned `url` in the browser and give it to the user.

## How to investigate

1. Find where AI runs: `generateText`, `streamText`, `generateObject`,
   `streamObject`, `@ai-sdk/*` providers, agent loops, tool definitions (`tool({…})`).
2. Identify the models in use and their provider (OpenAI, Anthropic, Google, …).
3. Identify the tools models can call (web search like Exa / Firecrawl / Parallel,
   DB queries, internal functions) and external integrations/services.
4. Map the business logic too: the internal services/pipelines the product is
   built from (billing, ingestion, background workers, domain services) — these
   become `service` nodes, and the interesting sentence goes on the edge
   (e.g. "charges Stripe on trial end").
5. Map the main flows: entry points (routes, webhooks, pages, CLIs), scheduled
   jobs (crons / queues / workers), the agents, the models and tools they use,
   and the datastores/services they read and write.

## Output contract — write EXACTLY this shape to `.foglamp/scan.json`

```jsonc
{
  "version": 1,
  "project": {
    "name": "string (≤48)",
    "slug": "lowercase-dashed (≤48)",
    "tagline": "one line (≤80, optional)",
    "iconDomain": "domain for the project's favicon, e.g. acme.com (optional)",
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
        "sourceRef": "src/agents/support.ts:42",
        "detail": "Answers tickets with order lookups (≤200, optional)" },
      { "id": "gpt4o", "label": "GPT-4o", "kind": "model", "domain": "openai.com" },
      { "id": "billing", "label": "Billing service", "kind": "service",
        "sourceRef": "src/services/billing.ts" },
      { "id": "pg", "label": "Postgres", "kind": "store", "domain": "postgresql.org" }
    ],
    "edges": [
      { "from": "chat", "to": "agent", "kind": "triggers" },
      { "from": "agent", "to": "gpt4o", "kind": "calls" },
      { "from": "billing", "to": "pg", "kind": "writes", "label": "charges on trial end" }
    ]
  }
}
```

## Rules — these keep every scan consistent, do not break them

- **Caps:** `topModels` ≤ 3, `topTools` ≤ 10, `topIntegrations` ≤ 10,
  `graph.nodes` ≤ 60, `graph.edges` ≤ 120. One map holds everything — AI flows
  AND business logic. Big maps are welcome (the viewer pans); aim for 20–40
  nodes on a substantial codebase. Rich, not sparse — but every node must earn
  its place.
- Give every distinct agent its **own node** when there are ≤ 10 agents; only
  merge agents into one node when they're numerous and near-identical (then say
  so in `sub`). Chain agents with agent→agent edges when one feeds the next.
- **`group`** (optional, ≤24): tag related nodes with a shared group name —
  those nodes render as one labeled vertical stack. Group by feature/domain the
  way a team would say it (`"Billing"`, `"Ingestion"`, `"Setup pipeline"`), not
  by file layout. Use 2–3 groups of 3–6 nodes; leave hub-and-spoke nodes ungrouped.
- **Node labels ≤ 28 chars**, `sub` ≤ 40, edge labels ≤ 24. Keep them tight.
- **`kind`** is one of: `entry` (trigger/route/page/CLI), `cron` (scheduled job),
  `agent`, `model`, `tool`, `service` (internal business-logic module/pipeline
  the project owns), `store` (DB/cache/index), `external` (3rd-party API).
- **Edge `kind`** (optional): `"calls" | "reads" | "writes" | "triggers"` — what
  the connection does. Prefer setting it; it's shown quietly (revealed when a
  flow is traced). Add a `label` only when a specific phrase says more (e.g.
  `"charges on trial end"` — put business logic on edges); labels are always
  visible.
- **`domain`** is a favicon domain (no scheme), e.g. `openai.com`, `anthropic.com`,
  `exa.ai`, `firecrawl.dev`, `clickhouse.com`. Add it to models, tools,
  integrations, and graph nodes whenever a recognizable company/product owns it.
  Omit it for purely internal nodes (entries, crons, services, internal tools).
  Use the product domain for models (`gemini.google.com` for Gemini, `claude.ai`
  for Claude).
- **`detail`** (optional, ≤200) is shown when a node is clicked — one sentence
  of what it does. **`sourceRef`** (optional, ≤120) is the repo path (plus
  `:line`) where the node lives, e.g. `src/agents/support.ts:42` — add it to
  internal nodes so teammates can jump to code.
- Every edge's `from`/`to` must reference an existing node `id`; ids unique.
- Use today's date for `project.date`.
- Favor the few flows that matter (e.g. `cron → agent → model + tools → store`)
  over an exhaustive dependency dump.

## Publish

First run (no `.foglamp/scan.lock.json` yet) — upload the scan directly:

```bash
curl -sS -X POST https://api.foglamp.dev/scan \
  -H 'content-type: application/json' \
  --data @.foglamp/scan.json
```

Update run (a `.foglamp/scan.lock.json` exists) — send the data plus the saved
`editToken` so the **same URL** is updated:

```bash
jq -n --slurpfile d .foglamp/scan.json \
      --arg t "$(jq -r .editToken .foglamp/scan.lock.json)" \
      '{data: $d[0], editToken: $t}' \
| curl -sS -X POST https://api.foglamp.dev/scan \
    -H 'content-type: application/json' --data @-
```

The response is JSON: `{ "slug", "url", "editToken", "expiresAt" }`. Save it:

```bash
# write the response to .foglamp/scan.lock.json (slug, url, editToken)
```

Then open `url` and share it with the user. If the response is an error (e.g. a
422 with `details`), fix `.foglamp/scan.json` to satisfy the rules above and retry.

> Self-hosting foglamp? Replace `api.foglamp.dev` with your server's URL.
```
