# Deploying the HUD demo → hud.foglamp.dev

The demo is a Bun server that hosts an in-process SSE broker and proxies it onto
its own origin at `/hud/events`. We run it on **Cloud Run**, reusing the repo's
multi-target `Dockerfile` (`--target hud-demo`) and Artifact Registry. It scales
to zero while idle; an active SSE request keeps the single allowed instance alive.

## Why these settings

- **`NODE_ENV` must not be `production`.** The SDK gates `hud: true` to
  non-production runtimes; the `hud-demo` image sets `NODE_ENV=development` so the
  broker actually starts. (Cloud Run's `K_SERVICE` is **not** treated as
  serverless by the SDK, and Bun reports `process.versions.node`, so the only gate
  that matters is `NODE_ENV`.)
- **Scale to zero, maximum one instance** (`--min-instances=0
  --max-instances=1`): the broker is in-process, so concurrent visitors must hit
  the same instance to share the live stream. The first visitor after an idle
  period can see a cold start.
- **CPU throttled between requests** (`--cpu-throttling`): no compute is reserved
  while the demo is idle. The mock heartbeat runs while the SSE stream keeps the
  instance active; its in-memory replay buffer resets after scale-to-zero.
- **No token cost:** the agents are `MockLanguageModelV4` — no real model calls.

## First deploy (creates the service)

```bash
PROJECT=foglamp-prod
REGION=us-central1
REPO=us-central1-docker.pkg.dev/foglamp-prod/foglamp

# Build + push the image (run from the repo root — build context is the monorepo).
# Cloud Run runs linux/amd64 — on an Apple Silicon / arm64 machine you MUST
# cross-build for amd64 (buildx + QEMU) or Cloud Run rejects the image with
# "container failed to start and listen on PORT". CI (amd64 runners) is native.
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
docker buildx build --platform linux/amd64 --target hud-demo \
  -t "$REPO/hud-demo:latest" --push .

# Create the Cloud Run service
gcloud run deploy foglamp-hud \
  --project "$PROJECT" --region "$REGION" \
  --image "$REPO/hud-demo:latest" \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=1 \
  --cpu-throttling \
  --cpu=1 --memory=512Mi \
  --port=8080
```

## Map the domain

```bash
gcloud beta run domain-mappings create \
  --project foglamp-prod --region us-central1 \
  --service foglamp-hud --domain hud.foglamp.dev
```

Then add the `CNAME` / records it prints to the `foglamp.dev` DNS zone. Cloud Run
provisions the TLS cert automatically once the record resolves.

## Subsequent deploys

Image-only updates carry over scaling/env from the live revision (same pattern as
`deploy-gcp.yml`):

```bash
docker buildx build --platform linux/amd64 --target hud-demo \
  -t "$REPO/hud-demo:latest" --push .
gcloud run deploy foglamp-hud --project foglamp-prod --region us-central1 \
  --image "$REPO/hud-demo:latest"
```

Pushes to `master` deploy automatically: `.github/workflows/deploy-gcp.yml`
builds `--target hud-demo` and redeploys `foglamp-hud` whenever the diff touches
`examples/hud-demo/**` (or a shared input — `packages/**`, `Dockerfile`,
`bun.lock`). The manual commands above are only needed for the first deploy or an
out-of-band push.

## Smoke test

```bash
# `/` 302s to the canonical marketing page at foglamp.dev/hud:
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hud.foglamp.dev/
# SSE stream (should stay open and stream events; CORS `*` for foglamp.dev):
curl -N https://hud.foglamp.dev/hud/events
```

## Relationship to foglamp.dev/hud

The marketing page at `foglamp.dev/hud` embeds `<FoglampHUD url="https://hud.foglamp.dev/hud/events" />`
cross-origin and triggers `POST /api/storm` from the browser — that's why the
SSE proxy and API routes send CORS headers, and why this service must stay
always-on. This origin is no longer a standalone landing page; its root
redirects to the marketing page.
