# Frontend

Conventions for building anything UI-side in this repo. Every rule is a hard rule unless stated otherwise — if a pattern doesn't fit, raise it before working around.

## Layout

```
apps/web/src/
  app/
    (app)/              # auth-gated routes — group layout enforces session
    login/              # public routes outside the (app) group
    layout.tsx          # root layout (fonts, providers, theme)
  components/           # app-specific composites (Header, MagicLinkForm, …)
  lib/                  # client-only helpers (auth-client, utils)
packages/ui/src/
  components/           # shadcn-derived primitives — single source of truth
  lib/utils.ts          # cn()
  styles/globals.css    # Tailwind v4 tokens, custom shadows, fonts
```

- **Always** put auth-gated pages under `app/(app)/` so the group layout can guard them in one place.
- **Always** put reusable UI primitives in `packages/ui/src/components/`. App-specific composites (forms, headers wired to project state) live in `apps/web/src/components/`.
- **Never** create a new primitive in `apps/web/src/components/` — extend or compose the one in `@boilerplate/ui/components/`\*.

## Routing — Next.js 16 App Router

- **Always** keep authenticated routes inside the `(app)` route group; the group's `layout.tsx` resolves the session and redirects on miss.
- **Always** name files `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` per the App Router conventions.
- **Never** use the Pages Router. Never add a `pages/` directory.
- **Never** put auth checks in individual page files when a group layout can cover the whole subtree.

## Server vs client components

- **Server components are the default** — a file with no `"use client"` directive runs on the server. Use them when it's straightforward (e.g. a `page.tsx` that needs to read the session or fetch something on the server before rendering).
- `**"use client"` is fine\*\* — reach for it whenever a page needs hooks, browser APIs, or interactivity. Don't contort the file structure just to keep the boundary "as deep as possible." A whole-page client component is acceptable.
- **Always** mark client components with `"use client"` at the top of the file.
- **Never** import `next/navigation`'s `useRouter`/`usePathname`, `useState`, `useEffect`, or any browser-only API in a file that doesn't have `"use client"`.

## Data fetching — tRPC v11 + TanStack Query

- **Always** use `createTRPCOptionsProxy` (not `createTRPCReact`). The proxy returns option objects that you pass directly into `useQuery` / `useMutation`.
- **Always** instantiate the proxy in `apps/web/src/lib/trpc.ts` and import from there.
- **Always** call queries via `useQuery(trpc.<router>.<proc>.queryOptions(input))` and mutations via `useMutation(trpc.<router>.<proc>.mutationOptions({ onSuccess }))`.
- **Always** invalidate with `queryClient.invalidateQueries(trpc.<router>.<proc>.queryFilter())` after a successful mutation.
- **Never** call `fetch` to hit the API directly from a component. Use tRPC.

## Forms — `@tanstack/react-form`

- **Always** use `@tanstack/react-form` with Zod validators on the form (`validators: { onSubmit: schema }`).
- **Always** keep the schema next to the form component, or import from `@boilerplate/api` if it's shared with a procedure.
- **Always** disable the submit button with `form.Subscribe` reading `state.canSubmit && !state.isSubmitting`.
- **Never** add `react-hook-form`. Never roll a hand-managed form with `useState` for inputs.

## State

- **Default** to `useState` for component-local state and TanStack Query for server state.
- **Never** add a global state library (Zustand, Redux, Jotai). If you think you need one, raise it.
- **Never** mirror server data into `useState` — read it from the query.

## Toasts — `sonner`

- **Always** trigger user-facing notifications via `toast.success` / `toast.error` from `sonner`.
- **Always** rely on the global `QueryCache.onError` (in `providers.tsx`) to surface tRPC errors as `toast.error`. Don't add `onError` to every mutation.
- **Always** mount `<Toaster />` once, in the root providers.
- **Never** use `alert()` or a custom toast component.

## Theming — `next-themes`

- **Always** wrap the app in `ThemeProvider` from `next-themes` with `attribute="class"` and `defaultTheme="system"`.
- **Always** use the `<ModeToggle />` from `apps/web/src/components/mode-toggle.tsx` as the canonical theme switcher.
- **Never** read or set `document.documentElement.classList` to toggle themes manually.

## Building UI

How to make new UI feel native to this codebase, not just "shadcn with a coat of paint."

- **Always** prefer the semantic tokens defined in `globals.css` (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-destructive`, `bg-muted`, …). They flip correctly between light and dark for free.
- **Always** design and verify both light and dark mode. The app uses `next-themes` with `attribute="class"` and defaults to `system` — every screen must look right in both. A screen that only works in one mode is broken.
- **Always** use the `neutral` palette when you genuinely need a raw Tailwind color and a semantic token doesn't fit (e.g. illustrations, data viz, a one-off accent). For accents prefer the chromatic palettes (`blue`, `emerald`, `amber`, `rose`, …) and pair `*-500/600` with their `*-100` or `*-950` counterparts so the choice reads in both modes.
- **Never** use `slate`, `gray`, `zinc`, or `stone`. They drift from the project's tonal range and clash with the semantic tokens. `neutral` is the only generic grayscale palette allowed.
- **Never** hardcode a hex / `rgb()` / `oklch()` color in `className` or `style`. If a value isn't in the theme, add a token to `globals.css` first.
- **Always** keep spacing on Tailwind's scale (`gap-2`, `p-4`, `space-y-6`). No `p-[13px]` arbitrary values unless there's a specific reason — and if there is, leave a one-line comment.
- **Always** use `cursor-pointer` for clickable items.
- **If applicable** add icons along the text in the Badges.

## Styling — Tailwind v4

- **Always** style with Tailwind utility classes. Tokens (colors, radii, shadows, fonts) are defined in `packages/ui/src/styles/globals.css` via `@theme` and `@custom-variant dark`.
- **Always** use the custom shadow tokens for elevation and separation: `shadow-(--custom-shadow)` and its color variants. These are the project's "border" — they replace it everywhere.
- **Always** merge classes with `cn()` from `@boilerplate/ui/lib/utils`.
- **Never** use `border`, `border-`_, or `divide-_` for visual separation. Use a shadow token instead.
- **Never** add raw CSS files for component styling. Add a token to `globals.css` if a value needs to be reused.
- **Never** inline `style={{ ... }}` for values that have a Tailwind utility.

## Animations

- **Default** to `tw-animate-css` utility classes (`animate-in`, `fade-in`, `slide-in-from-`\*, `animate-spin`, etc.) for transitions and entrances.
- **Never** add `motion/react` (Framer Motion) unless the user explicitly asks for it. It's heavier than what most UI work needs.

## UI primitives — `@boilerplate/ui`

- **Always** import primitives from `@boilerplate/ui/components/<name>` (`Button`, `Input`, `Card`, `Dialog`, `Sidebar`, `Table`, …). They're shadcn-derived and pre-tokenized.
- **Always** extend a primitive by composing it. If a one-off variant is needed, pass `className` with `cn()`. If it's reused, add a variant in the package.
- **Never** reimplement a primitive inline in `apps/web`. If something is missing, add it to `@boilerplate/ui` and import it.
- **Never** install a second component library (Radix Themes, MUI, Mantine, HeroUI, …).

## Composition — Base UI `render` prop

- **Always** use the Base UI `render` prop pattern when a primitive needs to render as a different element (e.g. `<Button render={<Link href="/x" />}>`).
- **Never** use Radix's `asChild` pattern. Our primitives are Base UI.

## Sidebar

- **Always** use `<Sidebar variant="inset" />`. The inset variant is the only one we ship.
- **Always** wrap pages that own the sidebar in `<SidebasrProvider>` and place content in `<SidebarInset>`.
- **Always** handle scroll containment in the consumer layout (`h-svh min-h-0` on the provider, `overflow-hidden` on the inset, `overflow-y-auto` on the inner main). The sidebar component does not contain scroll itself.
- **Never** use `variant="sidebar"` or `variant="floating"`.

## Icons — `@tabler/icons-react`

- **Always** import icons from `@tabler/icons-react` (e.g. `IconLoader2`, `IconChevronDown`).
- **Always** size icons with Tailwind: `size-3.5` is the default. Use `size-3` for compact contexts (badges, dense table cells) and `size-4` for medium emphasis (page headers, primary actions).
- **Never** add `mr-2` (or any margin) to an icon inside a `<Button>`. The button already spaces children with `gap-`\*.
- **Never** mix icon libraries. No `lucide-react`, `react-icons`, etc.

## Loading / empty states

- **Always** render `<Skeleton>` from `@boilerplate/ui/components/skeleton` for content placeholders.
- **Always** render `<Empty>` from `@boilerplate/ui/components/empty` for empty list / zero-state UI.
- **Always** use `<IconLoader2 className="size-4 animate-spin" />` for inline / full-page loading spinners.
- **Never** render a bare "Loading..." string.

## Tables

- **Always** use the shadcn `<Table>` primitive from `@boilerplate/ui/components/table` (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`).
- **Never** add TanStack Table, AG Grid, or any other table library.

## Modals / dialogs

- **Always** use `<Dialog>` from `@boilerplate/ui/components/dialog` for modal interactions.
- **Never** build custom overlay/portal logic. The primitive handles focus trap, scroll lock, and a11y.

## Dates — `date-fns`

- **Always** format and manipulate dates with `date-fns` (`format`, `formatDistanceToNow`, `parseISO`, `isAfter`, …).
- **Always** parse API date strings with `parseISO` (the API returns ISO 8601 strings — see BACKEND.md "Date columns") before formatting.
- **Never** add `dayjs`, `moment`, or `luxon`. Never reach for `Intl.DateTimeFormat` for trivial formats when `date-fns` covers it.

## Links — `next/link`

- **Always** use `<Link href="...">` from `next/link` for in-app navigation. Use `<Button render={<Link href="..." />}>` to make a styled button navigate.
- **Never** use a raw `<a href="...">` for internal routes — it triggers a full page reload and breaks client navigation. `<a>` is acceptable only for `mailto:`, `tel:`, or external links that explicitly need a fresh document load.

## Images — `next/image`

- **Always** use `<Image>` from `next/image`. It handles sizing, lazy loading, and modern formats.
- **Always** provide a meaningful `alt` prop. For purely decorative images, `alt=""` is acceptable; the prop itself is mandatory.
- **Never** use a raw `<img>` tag.

## Fonts — `next/font/google`

- **Always** load fonts via `next/font/google` in `apps/web/src/app/layout.tsx` and expose them as CSS variables (`--font-sans` for Inter, `--font-mono` for Geist Mono).
- **Always** wire the variables into Tailwind via `@theme` in `globals.css`.
- **Never** add a `<link rel="stylesheet">` to a Google Fonts URL. Never `@import` a font in CSS.

## Env vars — `@t3-oss/env-nextjs`

- **Always** declare web vars in `packages/env/src/web.ts` (`@t3-oss/env-nextjs`). Anything exposed to the browser must be prefixed `NEXT_PUBLIC_*`.
- **Always** set `emptyStringAsUndefined: true` and add the var to both `client` and `runtimeEnv`.
- **Always** import via `@boilerplate/env/web`. Never read `process.env.*` directly from app code (the validated `env` object is the only source of truth).
- **Always** add a new var in three places at once: `packages/env/src/web.ts`, `apps/web/.env.example`, and `turbo.json` `tasks.build.env`. Turbo prunes unlisted vars from production builds — local dev will work, deploys will silently lose the value.
- **Never** put a secret in a `NEXT_PUBLIC_*` var. Anything `NEXT_PUBLIC_*` ships in the client bundle.

## Async `params` and `searchParams`

In Next 15/16 the `params` and `searchParams` props on `page.tsx` and `layout.tsx` are **Promises**. Same for `cookies()`, `headers()`, and `draftMode()` from `next/headers`.

- **Always** type them as `Promise<...>` and `await` before reading:
  ```ts
  export default async function Page({
    params,
    searchParams,
  }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }) {
    const { id } = await params;
    const { tab } = await searchParams;
    // ...
  }
  ```
- **Always** `await headers()` / `await cookies()` — they return Promises too. The `(app)/layout.tsx` and dashboard page in this repo already do this.
- **In client components**, use the `use(params)` / `use(searchParams)` hook from React (the props are still Promises when forwarded down) — or pass the resolved values from the server parent as plain props.
- **Never** access `params.id` or `searchParams.tab` synchronously. TypeScript will catch it; runtime will throw.

## Auth — Better Auth

The Better Auth instance lives on `apps/server/` (Hono), not in the web app. Web talks to it over HTTP through `authClient`.

- **Always** import `authClient` from `@/lib/auth-client`.
- **Always** read the session in client components via `authClient.useSession()`.
- **Always** read the session in server components via `await authClient.getSession({ fetchOptions: { headers: await headers() } })` — `headers()` from `next/headers` forwards the cookie to the server.
- **Always** gate auth-required routes in `app/(app)/layout.tsx` — call `authClient.getSession` and `redirect("/login")` on miss. Pages inside `(app)/` then assume the session exists.
- **Never** import `@boilerplate/auth` from web code. It pulls in the DB + server env and only works inside `apps/server/`.
- **Never** call `fetch("/api/auth/...")` directly from a component. Use `authClient.signIn.`\* / `authClient.signOut()`.
