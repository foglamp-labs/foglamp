# Foglamp

**The missing observability layer for the Vercel AI SDK.**

Two lines of code and an API key give you unified observability for your AI
agents — **costs, latency, token usage, distributed traces, and prompt/response
logs** — across every `generateText` / `streamText` call in your app.

Foglamp is **open source** ([Apache 2.0](#license)) and self-hostable. Bring
your own ClickHouse + Postgres with `docker compose up`, or point the SDK at
the hosted endpoint.

```ts
import { registerTelemetry } from "ai";
import { foglamp } from "foglamp";

registerTelemetry(foglamp()); // that's it — every AI SDK call is now traced
```

---

## Why

The Vercel AI SDK gives you `generateText`, `streamText`, tools, and multi-step
agents — but no first-class answer to *"what did that agent cost, how slow was
it, and what did it actually send the model?"* Foglamp fills that gap:

- **Cost** — computed at ingest from OpenRouter pricing, per token dimension
  (prompt, completion, cached, reasoning, images, web search, …). Unknown model
  → cost shows `—`, never a misleading `$0`. Per-project custom price overrides.
- **Latency & TTFT** — p50 / p95 / p99 per model, agent, and over time. Time to
  first token is read from the SDK's own step timing, not hand-rolled.
- **Tokens** — input/output/total, with cost coverage so you know what fraction
  of spans were actually priced.
- **Distributed traces** — a trace is one top-level call; steps and tool calls
  are spans. Waterfall view with the exact prompt and response on every span.
- **Names, agents, workflows, sessions** — every call is identified by a
  `traceName` or an `agentName`; `workflowName` + `workflowRunId` and `sessionId`
  group calls further. All first-class, indexed fields. Everything else is
  free-form `metadata`.
- **Alerts** — threshold rules on cost, latency, error rate, TTFT, tokens, or
  request count, evaluated every minute, with email notifications.

Scope: **TypeScript + Vercel AI SDK v4–v7** — v7 via the native
telemetry-integrations collector, v4/v5/v6 via the [`foglamp/wrap`](./docs/sdk/wrap.mdx)
entry point. (OTLP ingest is a planned follow-up; see [Deferred](#deferred).)

---

## Quickstart

### 1. Install the SDK

```bash
npm i foglamp     # ai@7 is a peer dependency
```

### 2. Set your API key

```bash
export FOGLAMP_API_KEY=fl_…
# Self-hosting? Also point the SDK at your own ingest endpoint:
export FOGLAMP_INGEST_URL=http://localhost:4000/ingest
```

Get the key from the dashboard (**Settings → API keys**), or — when
self-hosting — from the `migrate` service logs on first `docker compose up`.

### 3. Instrument your code

**Global** — instruments every AI SDK call in the process:

```ts
import { registerTelemetry } from "ai";
import { foglamp } from "foglamp";

registerTelemetry(foglamp());
```

**Per-call** — typed, wins over the global integration, and attaches
first-class context:

```ts
import { foglamp } from "foglamp";
import { generateText } from "ai";

const fog = foglamp();

const { text } = await generateText({
  model,
  prompt: "What is Foglamp?",
  telemetry: {
    integrations: [
      fog.integration({
        agentName: "support-bot",
        workflowName: "ticket-triage",
        workflowRunId: run.id,
        sessionId: user.sessionId,
        metadata: { tenant: "acme", plan: "pro" },
      }),
    ],
  },
});
```

Every call must set **`traceName` or `agentName`** — use `traceName` for a
one-off call (e.g. `fog.integration({ traceName: "classify-email" })`) and
`agentName` to group it under an agent. `workflowName` and `workflowRunId` are
passed together (both or neither). This is enforced at compile time and at
ingest.

If `FOGLAMP_API_KEY` is unset, the SDK is a **silent no-op** — it never
throws and never adds latency. A complete, offline-runnable example lives in
[`examples/basic`](./examples/basic).

---

## SDK reference

### `foglamp(config?) → Collector`

Creates a collector that is both an AI SDK `Telemetry` integration (pass to
`registerTelemetry`) and a factory for per-call integrations.

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | `process.env.FOGLAMP_API_KEY` | API key. Unset ⇒ no-op. |
| `endpoint` | `process.env.FOGLAMP_INGEST_URL` → hosted | Ingest URL. Self-hosters point this at their `apps/ingest`. |
| `flushIntervalMs` | `5000` | Flush cadence for long-running runtimes. |
| `maxBatchTraces` | `50` | Flush early once this many traces are buffered. |
| `maxBatchSpans` | `500` | Flush early once this many spans are buffered. |
| `maxPayloadChars` | `100_000` | Per-blob cap for serialized input/output (hard contract max 1 MB). |
| `recordInputs` | `true` | Capture prompt/messages as span `input`. |
| `recordOutputs` | `true` | Capture model/tool results as span `output`. |
| `waitUntil` | — | Serverless keep-alive (e.g. Vercel/CF `waitUntil`). Enables flush-per-call. |
| `fetch` | global `fetch` | Override the `fetch` used to POST batches. |
| `debug` | `false` | Log internal warnings/errors to the console. |
| `onError` | — | Called for transport errors. Telemetry never throws into your app. |

### `Collector` methods

- **`fog.integration(ctx)`** — a per-call integration bound to
  `{ traceName, agentName, workflowName, workflowRunId, sessionId, metadata }`.
  Requires `traceName` or `agentName`.
- **`fog.flush()`** — flush buffered traces now. `await` it before a short-lived
  process exits.
- **`fog.shutdown()`** — stop the flush timer and drain.

### Runtimes & flushing

- **Long-running (Node/Bun servers):** batches on a timer; nothing to do.
- **Vercel / AWS Lambda:** auto-detected — flushes per call via `waitUntil`.
- **Cloudflare Workers / other serverless:** pass `waitUntil: ctx.waitUntil`
  (or call `await fog.flush()` before returning) so a fire-and-forget flush
  isn't frozen with the response.

---

## Data model

| Concept | What it is |
| --- | --- |
| **Trace** | One top-level `generateText` / `streamText` call. |
| **Span** | A unit of work within a trace: an `llm` step, a `tool` call, or an `embedding`. |
| **`traceName`** | A label for the call. Required when `agentName` is absent (a one-off named call). First-class, indexed. |
| **`agentName`** | Which agent produced the call. First-class, indexed. |
| **`workflowName`** | A named pipeline the call belongs to. First-class, indexed. |
| **`workflowRunId`** | A single execution of a workflow; renamable in the UI. |
| **`sessionId`** | Groups traces for one user/conversation. First-class, indexed. |
| **`metadata`** | Free-form `Record<string, string>` — anything else you want to slice by. |

Spans are stored in **ClickHouse**; org/project/key/pricing/alert state in
**Postgres**. Costs are computed once at ingest and stored per dimension.

---

## Self-hosting

Everything you need is in [`docker-compose.yml`](./docker-compose.yml): plain
Postgres + ClickHouse + Redis, the ingest API, the dashboard API, and the web
app. No external queue, no Supabase — Redis only backs ingest rate limiting,
and removing it (and `REDIS_URL`) falls back to in-memory limiting.

```bash
docker compose up --build
```

This will:

1. Start Postgres and ClickHouse.
2. Run the one-shot **`migrate`** service — Postgres migrations, ClickHouse DDL,
   the spans retention TTL, and an idempotent **seed** (admin user → org →
   project → API key).
3. Start the **server** (`:3000`), **ingest** (`:4000`), and **web** (`:3001`).

Then:

- Open the dashboard at **http://localhost:3001**.
- Log in with the admin credentials printed once by the `migrate` service
  (search its logs for *"Save these now"*).
- Point your SDK at `FOGLAMP_INGEST_URL=http://localhost:4000/ingest` with
  the seeded API key.

**Email is optional.** Leave `RESEND_API_KEY` unset and you still log in via the
seeded email + password admin; magic-link and alert emails simply stay off.

> **Production note:** set a real `BETTER_AUTH_SECRET` (the compose default is
> dev-only) and `ADMIN_PASSWORD`. The browser-facing `NEXT_PUBLIC_*` URLs are
> baked into the web image at build time — rebuild the `web` target if you serve
> it from a domain other than `localhost`.

---

## Environment variables

Backend (`apps/server`, `apps/ingest`) — see [`apps/server/.env.example`](./apps/server/.env.example):

| Var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string. |
| `BETTER_AUTH_SECRET` | — | Auth signing secret (≥ 32 chars). |
| `BETTER_AUTH_URL` | — | Public URL of the server. |
| `CORS_ORIGIN` | — | Web app origin (also the alert email deep-link base). |
| `CORS_EXTRA_ORIGINS` | — | Extra allowed origins, comma/space separated (previews, staging). |
| `CLICKHOUSE_URL` / `_USER` / `_PASSWORD` / `_DATABASE` | `localhost:8123` / `default` / — / `foglamp` | ClickHouse connection. |
| `OPENROUTER_MODELS_URL` | OpenRouter models API | Pricing source (cached, 24h refresh). |
| `FOGLAMP_PRICING_FILE` | — | Local pricing JSON for air-gapped deploys. |
| `INGEST_PORT` / `INGEST_FLUSH_INTERVAL_MS` / `INGEST_FLUSH_MAX_ROWS` / `INGEST_RATE_LIMIT_RPS` | `4000` / `1000` / `1000` / `100` | Ingest tuning (`_RPS` is spans/second per API key). |
| `INGEST_MAX_BODY_BYTES` | `10485760` | Max ingest request body; larger gets `413`. |
| `REDIS_URL` | — | Optional shared Redis for ingest rate limiting across replicas. |
| `API_KEY_CACHE_TTL_MS` | `60000` | In-memory API-key cache TTL. |
| `ALERT_EVAL_INTERVAL_MS` / `ALERT_RENOTIFY_MS` | `60000` / `3600000` | Alert evaluator cadence + re-notify cooldown. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | — | Email (magic-link, alerts). Optional. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Optional Google OAuth. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Seed bootstrap; random password printed once if unset. |

Web (`apps/web`) — see [`apps/web/.env.example`](./apps/web/.env.example):

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SERVER_URL` | Browser-facing server URL (baked at build time). |
| `NEXT_PUBLIC_APP_URL` | Browser-facing web URL. |
| `INTERNAL_SERVER_URL` | SSR-only: how the web container reaches the server over the internal network. |

SDK:

| Var | Purpose |
| --- | --- |
| `FOGLAMP_API_KEY` | Project API key. Unset ⇒ SDK is a no-op. |
| `FOGLAMP_INGEST_URL` | Ingest endpoint. Defaults to the hosted endpoint. |

---

## Architecture

```
foglamp  ──POST /ingest──▶  apps/ingest  ──bulk insert──▶  ClickHouse
 (Telemetry impl)                   (auth, rate-limit,            (spans + MVs:
                                     cost-at-ingest, buffer)       trace / run /
                                                                   per-minute)
                                                                       │
 apps/web (Next.js)  ──tRPC──▶  apps/server  ──reads──────────────────┘
 (dashboard)                    (tRPC API, better-auth,
                                 alert evaluator cron)  ──▶  Postgres
                                                            (orgs, projects,
                                                             keys, pricing,
                                                             alerts)
```

Three deployables scale independently: **ingest** is write-heavy, **server** is
read-heavy + runs the alert cron, **web** is the dashboard.

### Monorepo layout

Bun workspaces + Turborepo.

| Path | Description |
| --- | --- |
| `apps/ingest` | Hono span-ingestion API (API-key auth, cost-at-ingest, write buffer). |
| `apps/server` | Hono + tRPC dashboard API, better-auth, alert evaluator. |
| `apps/web` | Next.js dashboard. |
| `packages/sdk` | Published `foglamp` — zero workspace runtime deps, `ai@7` peer. |
| `packages/contracts` | Zod wire contract shared by SDK ↔ ingest ↔ API. |
| `packages/cost` | OpenRouter pricing fetch + model normalization + cost computation. |
| `packages/clickhouse` | Client, DDL migrations + runner, query builders, bulk insert. |
| `packages/db` | Drizzle schema + migrations (Postgres). |
| `packages/api` | tRPC routers + services. |
| `packages/auth` | better-auth config + email. |
| `packages/env` | Validated env (`@t3-oss/env`). |
| `packages/ui` | shadcn UI (Tailwind v4, Base UI). |

---

## Development

```bash
bun install
bun run check-types        # type-check the whole workspace
bun run dev                # run apps in watch mode (needs Postgres + ClickHouse)
```

Local Postgres + ClickHouse come up with `docker compose up postgres clickhouse`,
or use the full stack above. The data model migrations:

```bash
bun run db:generate        # generate a Drizzle migration after a schema change
bun run db:migrate         # apply Postgres migrations
# ClickHouse DDL applies automatically on ingest boot and in the migrate service
```

## Contributing

Contributions welcome — especially **model aliases** in `@foglamp/cost` (so
more providers/models resolve to a price) and provider coverage. Please:

1. Keep `foglamp` dependency-free at runtime (zero workspace deps,
   `ai` stays a peer dep, don't force consumers to install `zod`).
2. Run `bun run check-types` before opening a PR.
3. Remember the storage invariants: API keys are stored as sha256 hashes only;
   unknown models price to `null`, never `$0`; in ClickHouse only `ORDER BY` /
   `PARTITION BY` are irreversible — everything else is an online `ALTER`.
4. Sign the [CLA](./CLA.md) — the bot prompts you automatically on your first PR.

## Deferred

OTLP `/v1/traces` ingest (stubbed), ClickHouse tiered storage, and the cloud
billing layer are intentionally out of this build. (AI SDK v4–v6 are covered
today via `foglamp/wrap`; Redis is now an optional rate-limiting backend.)

## License

Foglamp is open source:

- **The platform** — `apps/*` (ingest, server, web) and the server-side packages
  (`api`, `db`, `auth`, `clickhouse`, `cost`, `env`, `ui`) — is licensed under
  [**Apache 2.0**](./LICENSE). Use it, modify it, self-host it, embed it —
  including commercially — with no restrictions beyond the license's standard
  terms.
- **The SDK** — [`foglamp`](./packages/sdk) — is licensed under
  [**MIT**](./packages/sdk/LICENSE), and the bundled wire contract
  [`@foglamp/contracts`](./packages/contracts) under
  [**Apache-2.0**](./packages/contracts/LICENSE) — so you can embed the client
  anywhere, including in commercial and hosted products.

Future enterprise features may live in an `ee/` directory under a separate
commercial license; everything outside it stays Apache 2.0. Each package's
`license` field reflects which license applies.

Versions released before this change remain under the Elastic License 2.0.

### Contributing & the CLA

Contributions require signing the [Contributor License Agreement](./CLA.md). It's
automated — the CLA Assistant bot will prompt you on your first PR. The CLA lets
the project offer Foglamp under both Apache 2.0 and commercial licenses (e.g.
for future `ee/` features); you retain ownership of your contributions.
