# syntax=docker/dockerfile:1
#
# Multi-target image for the Watchtower self-host stack (see docker-compose.yml).
# Targets:
#   server  — read-heavy Hono/tRPC dashboard API + alert evaluator (tsdown bundle)
#   ingest  — write-heavy span ingestion API (tsdown bundle)
#   migrate — one-shot: Postgres migrate + ClickHouse DDL + seed, then exit
#   web     — Next.js dashboard (next start)
#
# Build a single target:  docker build --target server -t watchtower-server .
# Or let compose build them all:  docker compose build

ARG BUN_VERSION=1.2.19

# ---------- base: install the whole workspace once (lockfile-pinned) ----------
# .dockerignore keeps node_modules/dist/.next/.env out of the build context.
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

# ---------- server ----------
# tsdown inlines the @watchtower/* workspace packages; external npm deps
# (hono, better-auth, @trpc/server, pg, …) stay in node_modules.
FROM base AS server-build
RUN bun run --filter server build

FROM oven/bun:${BUN_VERSION}-slim AS server
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/apps/server/dist ./apps/server/dist
COPY --from=server-build /app/apps/server/package.json ./apps/server/package.json
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "apps/server/dist/main.mjs"]

# ---------- ingest ----------
FROM base AS ingest-build
RUN bun run --filter ingest build

FROM oven/bun:${BUN_VERSION}-slim AS ingest
WORKDIR /app
ENV NODE_ENV=production
COPY --from=ingest-build /app/node_modules ./node_modules
COPY --from=ingest-build /app/apps/ingest/dist ./apps/ingest/dist
COPY --from=ingest-build /app/apps/ingest/package.json ./apps/ingest/package.json
ENV INGEST_PORT=4000
EXPOSE 4000
USER bun
CMD ["bun", "run", "apps/ingest/dist/main.mjs"]

# ---------- migrate (one-shot bootstrap) ----------
# Runs from source in the full image so it has the drizzle migrations, the CH
# DDL runner, and the seed script. Exits 0 on success; compose gates the app
# tiers on its completion.
FROM base AS migrate
WORKDIR /app/apps/server
ENV NODE_ENV=production
CMD ["bun", "run", "scripts/docker-bootstrap.ts"]

# ---------- web ----------
# NEXT_PUBLIC_* are baked into the client bundle at build time, so they must be
# the browser-facing URLs (passed as build args by compose). INTERNAL_SERVER_URL
# is supplied at runtime for the SSR session gate to reach the server service.
FROM base AS web
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3001
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN bun run --filter web build
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "start"]
