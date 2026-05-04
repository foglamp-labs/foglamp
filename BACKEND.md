# Backend

Conventions for building anything server-side in this repo. Every rule is a hard rule unless stated otherwise — if a pattern doesn't fit, raise it before working around.

## Layout

```
apps/server/        # Hono entrypoint (main.ts), middlewares, route handlers
packages/api/       # tRPC routers, context, services, AI agents, queue publishers
packages/auth/      # Better Auth config + email senders
packages/db/        # Drizzle schema, migrations, exported `db` instance
packages/env/       # Zod-validated env vars (server + web)
```

- **Always** put HTTP-shaped code (Hono routes, middlewares, queue handlers) in `apps/server/`.
- **Always** put business logic, tRPC routers, AI agents, queue publishers in `packages/api/`.
- **Never** import from `apps/server/`_ inside `packages/api/`_ — packages are dependencies of the server, not vice versa.

## Server framework — Hono on Bun

- **Always** mount middleware in this order: `evlog` → `cors` → auth handler → tRPC → `/queue` sub-router → routes.
- **Always** type the app as `new Hono<EvlogVariables>()` so `c.get("log")` is typed.
- **Never** add `hono/logger` — `evlog` replaces it.
- **Never** create a second Hono instance; mount sub-routers with `app.route("/prefix", subRouter)`.

```ts
const app = new Hono<EvlogVariables>();
app.use(evlog);
app.use("/*", cors({ origin: trustedAppOrigins, credentials: true }));
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.use("/trpc/*", trpcServer({ router: appRouter, createContext }));
app.route("/queue", queue);
```

## API surface — tRPC v11

- **Always** define routers in `packages/api/src/routers/<entity>.ts` and assemble them in `routers/index.ts`.
- **Always** use `protectedProcedure` for anything that reads or writes user data. Use `publicProcedure` only for explicitly public endpoints (health checks, public listings).
- **Always** validate input with `.input(z.object({ ... }))` inline on the procedure.
- **Never** read `ctx.session` inside a `protectedProcedure` body to check auth — it's already guaranteed non-null by the middleware.
- **Never** return raw DB rows that include private columns; map to a DTO.

```ts
export const postRouter = router({
  list: protectedProcedure.query(({ ctx }) => listPosts(ctx.db, ctx.userId)),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      createPost(ctx.db, ctx.log, ctx.userId, input)
    ),
});
```

## Database — Drizzle

- **Always** import `db` from `@boilerplate/db`. Never instantiate Drizzle elsewhere.
- **Always** put schema in `packages/db/src/schema/<entity>.ts`, one file per table, and re-export from `schema/index.ts`.
- **Always** wrap multi-statement state changes in `db.transaction(async (tx) => { ... })`.
- **Prefer** the relational query API (`db.query.<table>.findFirst({ with: ... })`) for reads with relations; use `db.select()` for projections and aggregates.

```ts
await db.transaction(async (tx) => {
  await tx.update(posts).set({ status: "published" }).where(eq(posts.id, id));
  await tx
    .insert(postActivity)
    .values({ postId: id, kind: "publish", actorId });
});
```

## IDs

- **Always** generate primary keys with UUID v7 via the `uuidv7` package, app-side, in a Drizzle `$defaultFn`.
- **Always** declare the column as `text("id").primaryKey().$defaultFn(() => uuidv7())`. Use `text`, not `uuid` — keeps the schema homogeneous and easy to inspect.
- **Never** generate IDs database-side (`gen_random_uuid()`, sequences) — app-side generation works in tests without a DB roundtrip and lets you assemble objects before inserting.
- **Never** use UUID v4 for new tables — v7's time-prefixed bytes give better B-tree locality.
- The Better Auth tables (`user`, `session`, `account`, `verification` in `packages/db/src/schema/auth.ts`) are managed by Better Auth's scaffolding and keep their existing `text("id").primaryKey()` shape — do not retrofit them.

```ts
import { uuidv7 } from "uuidv7";

export const post = pgTable("post", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  // ...
});
```

## Date columns

- **Always** use `timestamp({ withTimezone: true })`. Postgres stores UTC and converts on read; naive timestamps will bite across regions.
- **Always** add both `createdAt` and `updatedAt` to every table — no exceptions.
- **Always** wire `updatedAt` with `.$onUpdate(() => new Date())` so Drizzle bumps it on every UPDATE.
- **Wire format**: tRPC has no `superjson` transformer configured, so `Date` columns serialize as **ISO 8601 strings** over the wire. Treat that as the API contract — clients receive `string`, not `Date`. If a client needs a `Date`, it constructs one with `new Date(iso)`.
- **Never** store timestamps as `text` ISO strings — use `timestamp` so range queries and indexes work.

```ts
createdAt: timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull(),
updatedAt: timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull(),
```

## Audit columns

- **Prefer** adding `createdBy` and `updatedBy` to tables that hold user-authored or user-mutated data — anything where "who did this?" is a question you'll plausibly want to answer later. Skip them where they don't fit: pure join tables, system-owned rows with no acting user, append-only event logs that already carry an `actorId`, or tables where every row is created by the same well-known process.
- **Always** declare them as `text(...).references(() => user.id).notNull()` pointing at the Better Auth `user` table from `@boilerplate/db` when you do add them.
- **Always** set `createdBy` on insert and `updatedBy` on every update from the resolved `ctx.userId`. Services receive `userId` as an argument — never read it from anywhere else.
- **Always** pass `updatedBy` explicitly in every `db.update(...).set({ ... })` that mutates a row; there is no Drizzle equivalent of `$onUpdate` for this, so forgetting it leaves stale audit data.
- **Never** retrofit the Better Auth tables (`user`, `session`, `account`, `verification`) with audit columns — they are managed by Better Auth's scaffolding.
- **Never** default `createdBy` / `updatedBy` to a system/sentinel user to "make tests easier" — pass a real `userId` (seed one in test setup if needed).

```ts
import { user } from "./auth";

createdBy: text("created_by")
  .references(() => user.id)
  .notNull(),
updatedBy: text("updated_by")
  .references(() => user.id)
  .notNull(),
```

```ts
// service
await db
  .update(posts)
  .set({ status: "published", updatedBy: userId })
  .where(eq(posts.id, postId));
```

## Migrations

**Migrations are handled by the human user, not by agents.** Your job stops at editing the schema file and (optionally) generating the SQL — never run `db:push` or `db:migrate`, and never apply schema changes against any database.

- **Always** stop after editing `packages/db/src/schema/<entity>.ts`. Tell the user a schema change was made and remind them to run the generate + migrate steps.
- **Always** offer to run `bun run --filter @boilerplate/db db:generate` if the user asks for the SQL — but `db:generate` only writes the file; it does not touch the DB. Commit the generated SQL alongside the schema change in the same PR.
- **Always** review the generated SQL with the user before they commit. `drizzle-kit` sometimes emits destructive diffs (e.g. a column rename as drop + add) that must be rewritten by hand to preserve data.
- **Never** run `db:push` — it bypasses migration files entirely and pushes the schema diff straight to a DB. The user uses it for local sketching; agents don't.
- **Never** run `db:migrate` — it applies pending migrations to a real database. The user runs this manually against prod after deploy.
- **Never** edit a migration after it has been merged. Add a new migration to fix it forward.

```bash
# Reference only — the user runs these, agents do not.
bun run --filter @boilerplate/db db:push      # local sketching (user)
bun run --filter @boilerplate/db db:generate  # before commit (agent may run if asked)
bun run --filter @boilerplate/db db:migrate   # manual, against prod, after deploy (user)
```

## Services folder — query + business logic colocation

- **Always** put non-trivial query logic and any logic shared across routers in `packages/api/src/services/<entity>.ts`.
- **Always** make services pure functions taking `(db, log, ...args)` — no module-level state, no implicit `db`.
- **Always** type the `db` param as `typeof db` (or import a `Database` alias from `@boilerplate/db`) so transactions (`tx`) are accepted too.
- **Never** call `auth.api.`\* from a service — auth resolution happens in `createContext` / `evlog`. Services receive a resolved `userId`.
- **Never** import services from another service circularly; if two services need each other, extract the shared helper.

```ts
// packages/api/src/services/posts.ts
import type { Database } from "@boilerplate/db";
import type { RequestLogger } from "evlog";

export async function createPost(
  db: Database,
  log: RequestLogger,
  userId: string,
  input: { title: string }
) {
  log.set({ op: "post.create", userId });
  const [row] = await db
    .insert(posts)
    .values({ ...input, authorId: userId })
    .returning();
  return row;
}
```

## Auth — Better Auth

- **Always** export the configured instance from `@boilerplate/auth`. Never construct `betterAuth(...)` outside that package.
- **Always** resolve the session via `auth.api.getSession({ headers })` inside `createContext`.
- **Never** call `auth.api.getSession` from a router or service — read `ctx.session` / `ctx.userId` instead.
- **Never** mount the auth handler under a custom path — it must be `/api/auth/`\*.

## Validation — Zod

- **Always** use Zod (not Valibot, not raw checks).
- **Always** define tRPC input schemas inline on the procedure.
- **Always** define agent output schemas next to the agent (`agents/<name>/agent.ts`).
- **Never** validate the same shape in two places — export the schema and reuse it.

## Env vars — `@t3-oss/env-`\*

- **Always** declare server vars in `packages/env/src/server.ts` (`@t3-oss/env-core`) and web vars in `packages/env/src/web.ts` (`@t3-oss/env-nextjs`).
- **Always** set `emptyStringAsUndefined: true`.
- **Always** import via `@boilerplate/env/server` or `@boilerplate/env/web`. Never read `process.env.X` directly.
- **Always** add the var name to `turbo.json` `tasks.build.env` in the same change — Turbo prunes unlisted vars from the build environment, so a missing entry breaks production builds even when local dev works. This is the easiest rule to forget; adding a new env var is a three-file change (`packages/env/src/<server|web>.ts`, `apps/<app>/.env.example`, `turbo.json`).
- **Never** mark a server var as optional just to silence a missing-var error — fix the env or default it explicitly.

## Logging — `evlog`

The `evlog` middleware creates a `RequestLogger` per request, stores it on the Hono context as `c.get("log")`, and emits one structured log line per request including status. The same logger is exposed as `ctx.log` in tRPC and accepted as a `(db, log, ...)` argument by services.

- **Always** use `ctx.log` (or the `log` arg in services) for any non-trivial event. Never use `console.log` in request-scoped code.
- **Always** annotate the request with `log.set({ op: "<entity>.<action>", ...ids })` at the top of each mutation, before any DB or AI calls.
- **Always** wrap AI SDK calls with `createAILogger(log)` from `evlog/ai` so prompts, tools, and token counts get logged.
- **Always** mask emails with `maskEmail` from `evlog/better-auth` before putting them in `log.set({ user })`.
- **Never** call `log.emit` yourself — the middleware emits exactly once at end of request.
- **Never** `log.error(err)` and then swallow the error — re-throw so the middleware's status logic runs.

```ts
// service
log.set({ op: "post.publish", postId });
await db.update(posts).set({ status: "published" }).where(eq(posts.id, postId));

// AI agent
const ai = createAILogger(log);
const agent = new ToolLoopAgent({ model: ai.wrap(registry.languageModel(tag)), ... });
```

## AI agents — Vercel AI SDK + Gemini

- **Always** put each agent in `packages/api/src/ai/agents/<name>/` with two files: `agent.ts` (wiring + execution) and `prompt.ts` (string builders).
- **Always** reference models through the registry (`registry.languageModel("google:gemini-...")`). Never call `google("...")` inline.
- **Always** use `ToolLoopAgent` + `Output.object({ schema })` for structured output. Never parse model text by hand.
- **Always** accept `(log: RequestLogger, ...args)` and wrap with `createAILogger(log)`.
- **Always** set `stopWhen: stepCountIs(N)` to bound tool-use loops.
- **Always** prepend the prompt with a date context line so the model knows "today."

```ts
export async function generatePost(log: RequestLogger, input: Input) {
  const ai = createAILogger(log);
  const agent = new ToolLoopAgent({
    model: ai.wrap(registry.languageModel(contentModelTag)),
    output: Output.object({ schema: postSchema }),
    stopWhen: stepCountIs(5),
    tools: { web_search: google.tools.googleSearch({}) },
  });
  const { output } = await agent.generate({ prompt: buildPostPrompt(input) });
  return output;
}
```

## Background jobs — Upstash QStash

- **Always** define typed publisher functions in `packages/api/src/queue/qstash.ts` (`publishX(data: XJob)` returning `qstash.publishJSON({ url, body, deduplicationId })`).
- **Always** define handlers in `apps/server/src/routes/queue.ts`, mounted at `/queue/<endpoint-name>`.
- **Always** verify the signature with `@upstash/qstash` `Receiver` on every handler.
- **Always** include a `deduplicationId` derived from the job's identifying fields (use only dashes for the id).
- **Always** poll long-running external work by self-re-queueing with `delay`. Never busy-loop.
- **Never** do CPU- or wall-time–bound work directly in a tRPC mutation — publish a job and return.

```ts
export async function publishGeneratePost(data: GeneratePostJob) {
  return qstash.publishJSON({
    url: `${getBaseUrl()}/queue/generate-post`,
    body: data,
    deduplicationId: `generate-post-${data.postId}`,
  });
}
```

## Cron / scheduled tasks

- **Always** define schedules in `vercel.json` hitting `GET /cron/<name>`.
- **Always** verify `Authorization: Bearer ${env.CRON_SECRET}` on the GET handler.
- **Always** write the cron handler so the same logic is reachable as a QStash-signed `POST` for manual triggering.
- **Never** put scheduling config anywhere other than `vercel.json`.

## Email — Resend

- **Always** use the official `resend` SDK (`new Resend(apiKey).emails.send(...)`). Never call the REST API with raw `fetch`.
- **Always** send through helpers in `packages/auth/src/email.ts` (or a feature-scoped equivalent).
- **Always** gracefully no-op when `env.RESEND_API_KEY` is absent — log via `evlog` (e.g. `log.info("email.<name>.skipped_no_api_key", { to, ... })`) so local dev doesn't require Resend.
- **Never** call the Resend SDK inline from a router; route through a helper.
- **Never** use `console.*` for the no-key fallback — use a module-level `createLogger()` instance from `evlog`.

## Webhook authentication

- **QStash**: verify with `Receiver({ currentSigningKey, nextSigningKey }).verify(...)`.
- **Vercel cron**: verify `Authorization: Bearer ${env.CRON_SECRET}`.
- **Never** trust `X-Forwarded-`\* headers for auth.

## Error handling

- tRPC: `throw new TRPCError({ code, message, cause })`. Auth issues are `UNAUTHORIZED`; missing rows are `NOT_FOUND`; bad input is `BAD_REQUEST`.
- Queue handlers: `log.error(err)` then re-throw so QStash retries.
- Hono routes: `throw new HTTPException(status, { message })`.
- **Never** catch an error just to swallow it. If you catch, either handle (with explanation in a comment) or re-throw.

## Testing — `bun:test`

- **Always** colocate tests as `*.test.ts` next to the file under test. Never use a separate `__tests__/` directory.
- **Always** import from `"bun:test"` (`describe`, `test`, `expect`).
- **Always** test services (pure `(db, log, args)` functions) directly, not through the tRPC router.
