# Roadmap

Ideas parked for later. Not commitments — a backlog to pull from. Each item is a
title plus a two-line sketch.

## Shipped

- **Sessions / conversation view** — group traces by `sessionId` into a multi-turn
  timeline (cost/latency/tokens per turn). Built.

## Platform & reach

### OTLP / OpenTelemetry ingestion
Implement the stubbed `POST /v1/traces` (currently 501) to accept OTLP/HTTP and
map gen_ai/OpenLLMetry attributes onto span rows — unlocks Python, LangChain, etc.

### Non-TS SDKs (Python, LangChain)
First-class SDKs beyond the Vercel AI SDK, or lean on OTLP ingestion above.
Biggest lever for adoption outside the JS ecosystem.

### Data API / export
Let users query their own traces/metrics/scores programmatically, or export them.
Read-only API keys + a typed query endpoint.

### PII redaction at ingest
Opt-in scrubbing of inputs/outputs before storage (reuse the PII code-scorer
patterns). A compliance unlock for enterprise.

## Quality & evals

### Experiments / version comparison
Tag traces with a prompt/model/git version and compare quality × cost × latency
across versions. The A/B story for prompt changes.

### Save-trace-as-eval-case + datasets
Turn production traces into labeled datasets, then run offline/CI evals against
them — a regression suite before deploy.

### Human-in-the-loop annotation queue
A review UI to thumbs/score traces, feeding the eval datasets above.
Closes the loop between production data and eval ground truth.

### Model recommendations (cost × eval) — *Enterprise-only*
"Agent X passes eval Z on a cheaper model — switch and save N%." Join scores ↔
spans by subject model. Listed on pricing; built on request.

### Relative regression alert thresholds
Add a delta/baseline comparison to alerts (e.g. pass-rate drops >10% vs prior
window), instead of only fixed thresholds. Small tweak to the alert engine.

## Debugging & DX

### Trace diff
Pick two runs of the same agent/workflow and compare inputs/outputs/steps/cost/
latency side by side. The complement to replay.

### Live tail / "happening now"
An SSE/websocket feed of traces as they land, with live TPS and in-flight streams.
The chunk-sampling groundwork is already done.

### Tools page
Aggregate view over `tool` spans: per-tool call volume, p50/p95 latency, error
rate, cost contribution. Mirrors the Agents/Workflows pages.

### Error clustering (Sentry-style)
Group failing traces by error signature into "issues" with counts and trends,
instead of a flat list.

### Streaming-stall detection
Use chunk samples to flag runs where TPS dropped mid-stream or TTFT spiked.
Unique to our intra-stream sampling data.

## Cost intelligence

### Per-customer / per-session cost attribution
Roll cost up by end-customer via `sessionId`/`metadata` — gold for anyone doing
usage-based pricing on top of foglamp.

### Cache-savings insights
Surface cache hit-rate (we already track cached/cache-write tokens) and "you'd
save $X with prompt caching."

### Spend budgets
Extend the quota/alert machinery to per-project/agent spend budgets with warn
thresholds and notifications.

## Reliability & ops

### Latency SLO dashboards
Surface p50/p95/p99 + TTFT distributions (quantiles already computed in
ClickHouse) and alert on latency regressions.

### More alert channels
Slack / Discord / PagerDuty / generic webhook delivery, alongside the existing
email channel.

## AI-native (Foggy)

### Natural-language analytics
Give Foggy analytics tools over ClickHouse: "why did costs spike yesterday?",
"show me the slowest agent this week."

### Auto-RCA on alerts
When an alert fires, have Foggy summarize the likely cause from the offending
traces and attach it to the notification.

### Weekly digest email
"Your agents this week": volume, cost, top errors, eval drift. A proactive
retention hook.
