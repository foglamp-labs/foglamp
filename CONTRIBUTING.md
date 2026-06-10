# Contributing to Foglamp

Thanks for your interest in improving Foglamp! This guide covers everything you
need to get the monorepo running, make a change, and open a pull request.

## Before you start: the CLA

Foglamp requires every contributor to sign a **Contributor License Agreement**
([`CLA.md`](./CLA.md)). It's automated — the **CLA Assistant** bot will comment
on your first pull request asking you to reply with a one-line signature. You
sign once and every future PR passes automatically.

The CLA lets the project be offered under both Apache 2.0 and separate
commercial licenses; **you keep full ownership of your contributions.**
See [`CLA.md`](./CLA.md) for the exact terms.

## Licensing of contributions

Foglamp uses a [split license](./README.md#license). Where your change lands
determines its license, so please keep contributions in the matching area:

| Area | License | Notes |
| --- | --- | --- |
| Platform — `apps/*`, and `packages/{api,auth,billing,clickhouse,config,cost,db,env,ui}` | **Apache-2.0** | Open source; the bulk of the codebase. |
| SDK — `packages/sdk` (`foglamp`) | **MIT** | Permissive; embedded in users' apps. |
| Wire contract — `packages/contracts` | **Apache-2.0** | The public ingest protocol. |
| Examples — `examples/*` | **MIT** | Sample code meant to be copied freely. |

**Dependencies:** the platform and SDK are distributed (self-hosted and via
npm), so please don't pull in **GPL / AGPL / SSPL**-licensed dependencies — they
conflict with our licensing. Permissive licenses (MIT, Apache-2.0, BSD, ISC,
MPL-2.0, LGPL-as-a-dynamic-dependency) are fine. If a new dependency's license
is unclear, flag it in the PR and we'll sort it out together.

## Prerequisites

- **[Bun](https://bun.sh) 1.2.19+** — the package manager and runtime
  (`packageManager` is pinned in the root `package.json`).
- **Docker** + Docker Compose — for the local Postgres + ClickHouse.
- **Node** is *not* required to run the apps, but some tooling shells out to it.

## Getting started

```bash
# 1. Install dependencies (whole workspace)
bun install

# 2. Start local infra (Postgres + ClickHouse) and the dev servers.
#    `bun dev` runs `dev:infra` first via the predev hook, then `turbo dev`.
bun dev
```

This brings up:

- **web** — the dashboard (Next.js)
- **server** — the read/dashboard API (`:3000`)
- **ingest** — the span ingest API (`:4000`)

To run a single app instead of the whole turbo graph:

```bash
bun dev:web      # web only
bun dev:server   # server only
```

Infra controls:

```bash
bun dev:infra        # start Postgres + ClickHouse only
bun dev:infra:down   # stop them
```

## Database

Postgres schema is managed with Drizzle; ClickHouse uses versioned DDL
migrations applied on boot.

```bash
bun db:push        # push the Drizzle schema to dev Postgres
bun db:generate    # generate a migration from schema changes
bun db:migrate     # apply migrations
bun db:studio      # open Drizzle Studio
bun db:seed        # seed an admin user → org → project → API key
```

If you change the Postgres schema, run `bun db:generate` and commit the
generated migration alongside your change.

## Before you push

Please run these locally — CI runs the same checks:

```bash
# Type-check the whole workspace
bun check-types

# The web app isn't in the turbo check-types graph; type-check it directly:
cd apps/web && npx tsc -p tsconfig.json --noEmit
```

Several packages ship a manual `validate` script that exercises the real data
path against a throwaway ClickHouse / Postgres (see each package's
`scripts/validate.ts`). If your change touches ingest, the span store, the SDK
wire shape, or evals, run the relevant `validate` script and mention the result
in your PR. A disposable ClickHouse for these:

```bash
docker run --rm -p 18123:8123 \
  -e CLICKHOUSE_DB=foglamp -e CLICKHOUSE_USER=default -e CLICKHOUSE_PASSWORD=foglamp \
  clickhouse/clickhouse-server:24.8-alpine
```

## Pull requests

- **Branch from `master`.** One logical change per PR; keep diffs focused.
- **Write a clear description** — what changed and why. Link any related issue.
- **Match the surrounding code** — naming, comment density, and idioms. The
  codebase favors short explanatory comments on non-obvious decisions.
- **Keep types green** and run the checks above.
- **Sign the CLA** when the bot prompts you.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/)-style
prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`), optionally scoped —
e.g. `fix(security): cap span metadata size`.

## Reporting bugs & requesting features

Open a GitHub issue. For bugs, include: what you did, what you expected, what
happened, and the smallest reproduction you can manage (versions, env, logs).

## Security

**Please do not file public issues for security vulnerabilities.** Email the
maintainers privately so we can address it before disclosure.

## Questions

Open a [Discussion](../../discussions) or an issue. Thanks for contributing! 🌫️
