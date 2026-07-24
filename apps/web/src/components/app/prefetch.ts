"use client";

import type { FetchQueryOptions } from "@tanstack/react-query";
import type { Route } from "next";

import { queryClient, trpc } from "@/utils/trpc";

// Hover/focus data prefetch for the sidebar links. Next.js already prefetches
// each route's code the moment its <Link> is on screen; this map covers the
// other half — the tRPC queries a page fires on mount — so that by the time
// the user finishes clicking, the page's cache is warm and it renders
// populated instead of skeleton-first.
//
// Every entry MUST mirror its page's own queryOptions input exactly (same
// values, in their initial/default state) — a mismatched key warms nothing.
// Filters, sort, and paging default to undefined/0 on every list page, and
// undefined props hash the same as omitted ones, so base args suffice.

/** Assembled by the sidebar from the live project + range contexts — the same
 * providers the pages read, so `from`/`to` serialize to identical keys. */
export type PrefetchCtx = {
  projectId: string;
  from: string;
  to: string;
};

/** Matches the PAGE_SIZE constant on the workflows/agents/sessions/traces
 * list pages. */
const PAGE_SIZE = 25;

// A prefetched entry counts as fresh for this long: hovering the same link
// repeatedly (or hovering right after visiting) becomes a no-op instead of
// re-firing the queries. Pages' own useQuery calls are unaffected — they
// mount against the warm cache and revalidate in the background as usual.
const PREFETCH_STALE_MS = 30_000;

const warm = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: FetchQueryOptions<any, any, any, any>,
): void =>
  void queryClient.prefetchQuery({ ...options, staleTime: PREFETCH_STALE_MS });

const routePrefetch: Partial<Record<Route, (ctx: PrefetchCtx) => void>> = {
  "/overview": ({ projectId, from, to }) => {
    const args = { projectId, from, to };
    warm(trpc.metrics.summary.queryOptions(args));
    warm(trpc.metrics.timeseries.queryOptions(args));
    warm(trpc.metrics.models.queryOptions(args));
    warm(trpc.metrics.costByModel.queryOptions(args));
    warm(trpc.metrics.cacheSummary.queryOptions(args));
    warm(trpc.agents.list.queryOptions({ ...args, limit: 100 }));
    warm(
      trpc.workflows.list.queryOptions({
        ...args,
        limit: 100,
        sort: { field: "cost", dir: "desc" },
      }),
    );
    warm(
      trpc.customers.list.queryOptions({
        ...args,
        limit: 100,
        includeUnidentified: true,
      }),
    );
    // The has-this-project-ever-received-a-trace probe (range-independent).
    warm(trpc.traces.list.queryOptions({ projectId, limit: 1 }));
  },
  "/workflows": ({ projectId, from, to }) => {
    warm(
      trpc.workflows.list.queryOptions({
        projectId,
        from,
        to,
        limit: PAGE_SIZE,
        offset: 0,
      }),
    );
  },
  "/agents": ({ projectId, from, to }) => {
    warm(
      trpc.agents.list.queryOptions({
        projectId,
        from,
        to,
        limit: PAGE_SIZE,
        offset: 0,
      }),
    );
  },
  "/sessions": ({ projectId, from, to }) => {
    const args = { projectId, from, to };
    warm(trpc.sessions.list.queryOptions({ ...args, limit: PAGE_SIZE, offset: 0 }));
    // Filter dropdowns.
    warm(trpc.agents.names.queryOptions(args));
    warm(trpc.customers.list.queryOptions(args));
  },
  "/traces": ({ projectId, from, to }) => {
    const args = { projectId, from, to };
    warm(trpc.traces.list.queryOptions({ ...args, limit: PAGE_SIZE, offset: 0 }));
    // Filter dropdowns.
    warm(trpc.agents.names.queryOptions(args));
    warm(trpc.workflows.names.queryOptions(args));
    warm(trpc.customers.list.queryOptions(args));
    warm(trpc.metrics.models.queryOptions(args));
  },
  "/evals": ({ projectId, from, to }) => {
    warm(trpc.evals.list.queryOptions({ projectId, from, to }));
    warm(trpc.evals.presets.queryOptions());
    warm(trpc.providerKeys.list.queryOptions({ projectId }));
  },
  "/alerts": ({ projectId }) => {
    warm(trpc.alerts.list.queryOptions({ projectId }));
    warm(trpc.evals.list.queryOptions({ projectId }));
  },
  "/settings": ({ projectId }) => {
    warm(trpc.projects.keys.list.queryOptions({ projectId }));
  },
  "/settings/org": ({ projectId }) => {
    warm(trpc.providerKeys.list.queryOptions({ projectId }));
  },
};

/** Warm the given route's queries. Safe to call eagerly — unknown routes and
 * a missing project are no-ops, and fresh cache entries aren't refetched. */
export function prefetchRoute(href: Route, ctx: PrefetchCtx | null): void {
  if (!ctx) return;
  routePrefetch[href]?.(ctx);
}
