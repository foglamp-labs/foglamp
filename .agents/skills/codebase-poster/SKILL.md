---
name: codebase-poster
description: Analyze a repository and publish a shareable foglamp codebase poster. Use when asked to "generate a codebase poster", "make a foglamp poster", "map how this repo uses AI", or "create a shareable architecture poster".
metadata:
  author: foglamp
  version: "2.0.0"
---

# Codebase Poster

Analyze the current repository, describe how it works and how it uses AI as a
small JSON object, then upload it to foglamp to get a **shareable link**
(`foglamp.dev/poster/<slug>`) that unfurls on socials. You produce only the
**data** — a fixed renderer draws the poster. Do not write any HTML or CSS.

## Steps

1. **Investigate** the repo (see "How to investigate" below) and build the JSON
   described in "Output contract". Write it to `.foglamp/poster.json`.
2. **Get consent.** Tell the user plainly: *"This uploads a high-level summary of
   your architecture (models, tools, integrations, and main flows — no code or
   secrets) to foglamp.dev and creates a public, unlisted link."* Only continue
   if they're OK with it.
3. **Upload** with `curl` (see "Publish"). Capture the JSON response.
4. **Save credentials** to `.foglamp/poster.lock.json` (so a later run updates the
   same URL instead of making a new one). Ensure `.foglamp/` is gitignored — the
   edit token is a secret.
5. **Open** the returned `url` in the browser and give it to the user.

## How to investigate

1. Find where AI runs: `generateText`, `streamText`, `generateObject`,
   `streamObject`, `@ai-sdk/*` providers, agent loops, tool definitions (`tool({…})`).
2. Identify the models in use and their provider (OpenAI, Anthropic, Google, …).
3. Identify the tools models can call (web search like Exa / Firecrawl / Parallel,
   DB queries, internal functions) and external integrations/services.
4. Map the main flows: entry points (routes, webhooks, pages, CLIs), scheduled
   jobs (crons / queues / workers), the agents, the models and tools they use,
   and the datastores/services they read and write.

## Output contract — write EXACTLY this shape to `.foglamp/poster.json`

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
      { "id": "agent", "label": "Support agent", "kind": "agent", "sub": "streamText" },
      { "id": "gpt4o", "label": "GPT-4o", "kind": "model", "domain": "openai.com" }
    ],
    "edges": [ { "from": "chat", "to": "agent" }, { "from": "agent", "to": "gpt4o", "label": "calls" } ]
  }
}
```

## Rules — these keep every poster consistent, do not break them

- **Caps:** `topModels` ≤ 3, `topTools` ≤ 5, `topIntegrations` ≤ 5,
  `graph.nodes` ≤ 18, `graph.edges` ≤ 32. **Prioritize** — pick the most
  important, most-used items. Do not dump everything.
- **Node labels ≤ 28 chars**, `sub` ≤ 40, edge labels ≤ 24. Keep them tight.
- **`kind`** is one of: `entry` (trigger/route/page/CLI), `cron` (scheduled job),
  `agent`, `model`, `tool`, `store` (DB/cache/index), `external` (3rd-party API).
- **`domain`** is a favicon domain (no scheme), e.g. `openai.com`, `anthropic.com`,
  `exa.ai`, `firecrawl.dev`, `clickhouse.com`. Add it to models, tools,
  integrations, and graph nodes whenever a recognizable company/product owns it.
  Omit it for purely internal nodes (entries, crons, internal tools).
- Every edge's `from`/`to` must reference an existing node `id`; ids unique.
- Use today's date for `project.date`.
- Favor the few flows that matter (e.g. `cron → agent → model + tools → store`)
  over an exhaustive dependency dump.

## Publish

First run (no `.foglamp/poster.lock.json` yet) — upload the poster directly:

```bash
curl -sS -X POST https://api.foglamp.dev/poster \
  -H 'content-type: application/json' \
  --data @.foglamp/poster.json
```

Update run (a `.foglamp/poster.lock.json` exists) — send the data plus the saved
`editToken` so the **same URL** is updated:

```bash
jq -n --slurpfile d .foglamp/poster.json \
      --arg t "$(jq -r .editToken .foglamp/poster.lock.json)" \
      '{data: $d[0], editToken: $t}' \
| curl -sS -X POST https://api.foglamp.dev/poster \
    -H 'content-type: application/json' --data @-
```

The response is JSON: `{ "slug", "url", "editToken", "expiresAt" }`. Save it:

```bash
# write the response to .foglamp/poster.lock.json (slug, url, editToken)
```

Then open `url` and share it with the user. If the response is an error (e.g. a
422 with `details`), fix `.foglamp/poster.json` to satisfy the rules above and retry.

> Self-hosting foglamp? Replace `api.foglamp.dev` with your server's URL.
```
