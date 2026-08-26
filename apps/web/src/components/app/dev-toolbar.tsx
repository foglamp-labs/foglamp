"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import {
  IconArrowUp,
  IconClockBolt,
  IconClockExclamation,
  IconDatabaseSearch,
  IconGauge,
  IconGaugeFilled,
  IconLayoutSidebar,
  IconRefresh,
  IconTrash,
  IconWifi,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  DEV_NETWORK_DELAYS,
  DEV_NETWORK_FAIL_RATE,
  type DevNetworkDelay,
  readDevForceLoading,
  readDevNetworkDelay,
  readDevNetworkFail,
  setDevForceLoading,
  setDevNetworkDelay,
  setDevNetworkFail,
  subscribeDevNetwork,
} from "@/utils/dev-network";

// ---------------------------------------------------------------------------
// Dev settings store
// ---------------------------------------------------------------------------
// A tiny localStorage-backed store (rather than context) so any component can
// subscribe to a dev setting without threading providers through the tree.
// Everything here is dev-only: in production the hooks return the default and
// the toolbar renders nothing.

const DEV = process.env.NODE_ENV === "development";

/** How the sidebar nav icons render: the current colored chip (background +
 * shadow) or just the colored glyph. */
export type NavIconVariant = "chip" | "simple";

const NAV_ICON_KEY = "foglamp:dev:nav-icon-variant";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readNavIconVariant(): NavIconVariant {
  if (typeof window === "undefined") return "chip";
  return window.localStorage.getItem(NAV_ICON_KEY) === "simple"
    ? "simple"
    : "chip";
}

function setNavIconVariant(variant: NavIconVariant) {
  // The default is absence, so a stale key never leaks into a fresh state.
  if (variant === "simple") window.localStorage.setItem(NAV_ICON_KEY, "simple");
  else window.localStorage.removeItem(NAV_ICON_KEY);
  for (const listener of listeners) listener();
}

/** The active nav-icon variant. Always "chip" outside development. */
export function useNavIconVariant(): NavIconVariant {
  const variant = useSyncExternalStore(
    subscribe,
    readNavIconVariant,
    () => "chip" as const
  );
  return DEV ? variant : "chip";
}

/** How an LLM bar renders its pre-first-token stretch in the waterfall. */
export type TtftVariant =
  | "dashed"
  | "stripes"
  | "faded"
  | "thin"
  | "gap"
  | "dots";

export const TTFT_VARIANTS: { value: TtftVariant; label: string }[] = [
  { value: "dashed", label: "Dashed" },
  { value: "stripes", label: "Stripes" },
  { value: "faded", label: "Faded" },
  { value: "thin", label: "Thin" },
  { value: "gap", label: "Gap" },
  { value: "dots", label: "Dots" },
];

const TTFT_KEY = "foglamp:dev:ttft-variant";
// "Faded" won the A/B — production always renders it; the other variants stay
// pickable from the dev toolbar.
const TTFT_DEFAULT: TtftVariant = "faded";

function readTtftVariant(): TtftVariant {
  if (typeof window === "undefined") return TTFT_DEFAULT;
  const v = window.localStorage.getItem(TTFT_KEY);
  return TTFT_VARIANTS.some((o) => o.value === v)
    ? (v as TtftVariant)
    : TTFT_DEFAULT;
}

function setTtftVariant(variant: TtftVariant) {
  // The default is absence, so a stale key never leaks into a fresh state.
  if (variant === TTFT_DEFAULT) window.localStorage.removeItem(TTFT_KEY);
  else window.localStorage.setItem(TTFT_KEY, variant);
  for (const listener of listeners) listener();
}

/** The active TTFT-wait rendering. Always the default outside development. */
export function useTtftVariant(): TtftVariant {
  const variant = useSyncExternalStore(
    subscribe,
    readTtftVariant,
    () => TTFT_DEFAULT
  );
  return DEV ? variant : TTFT_DEFAULT;
}

// Simulated network conditions (store lives in utils/dev-network.ts so the
// tRPC client can read it without importing component code). One hook per
// value keeps useSyncExternalStore snapshots primitive.

function useDevNetworkDelay(): DevNetworkDelay {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevNetworkDelay,
    () => 0
  );
}

function useDevNetworkFail(): boolean {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevNetworkFail,
    () => false
  );
}

function useDevForceLoading(): boolean {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevForceLoading,
    () => false
  );
}

function formatDelay(delay: DevNetworkDelay) {
  if (delay === 0) return "Off";
  return delay < 1_000 ? `+${delay} ms` : `+${delay / 1_000} s`;
}

// ---------------------------------------------------------------------------
// Dev bar
// ---------------------------------------------------------------------------

/** A rolling one-second FPS sample. Sampling resets while the document is
 * hidden so browser background throttling never produces a misleading dip. */
function useFramesPerSecond() {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameRequest = 0;
    let frames = 0;
    let sampleStartedAt = performance.now();

    function resetSample() {
      frames = 0;
      sampleStartedAt = performance.now();
    }

    function sample(now: number) {
      if (!document.hidden) {
        frames += 1;
        const elapsed = now - sampleStartedAt;
        if (elapsed >= 1_000) {
          setFps(Math.round((frames * 1_000) / elapsed));
          resetSample();
        }
      }
      frameRequest = window.requestAnimationFrame(sample);
    }

    document.addEventListener("visibilitychange", resetSample);
    frameRequest = window.requestAnimationFrame(sample);

    return () => {
      document.removeEventListener("visibilitychange", resetSample);
      window.cancelAnimationFrame(frameRequest);
    };
  }, []);

  return fps;
}

type QueryDiagnostic = { hash: string; label: string };

function formatQueryLabel(queryKey: readonly unknown[]) {
  const path = queryKey[0];
  if (Array.isArray(path) && path.every((part) => typeof part === "string")) {
    return path.join(".");
  }
  if (typeof path === "string") return path;
  try {
    return JSON.stringify(queryKey);
  } catch {
    return "Unknown query";
  }
}

function useQueryDiagnostics() {
  const queryClient = useQueryClient();
  const [diagnostics, setDiagnostics] = useState<{
    fetching: QueryDiagnostic[];
    stale: QueryDiagnostic[];
    /** Stale but unobserved (cached leftovers) — counted, not listed. */
    staleInactive: number;
  }>({ fetching: [], stale: [], staleInactive: 0 });

  useEffect(() => {
    const queryCache = queryClient.getQueryCache();
    function update() {
      const queries = queryCache.getAll();
      const summarize = (query: (typeof queries)[number]) => ({
        hash: query.queryHash,
        label: formatQueryLabel(query.queryKey),
      });
      const allStale = queries.filter(
        (query) => query.state.data !== undefined && query.isStale()
      );
      const observedStale = allStale.filter(
        (query) => query.getObserversCount() > 0
      );
      const next = {
        fetching: queries
          .filter((query) => query.state.fetchStatus === "fetching")
          .map(summarize),
        stale: observedStale.map(summarize),
        staleInactive: allStale.length - observedStale.length,
      };
      // Most cache events don't change the summary; skip the re-render then.
      setDiagnostics((prev) =>
        prev.fetching.length === next.fetching.length &&
        prev.stale.length === next.stale.length &&
        prev.staleInactive === next.staleInactive &&
        prev.fetching.every((q, i) => q.hash === next.fetching[i]?.hash) &&
        prev.stale.every((q, i) => q.hash === next.stale[i]?.hash)
          ? prev
          : next
      );
    }

    // Cache events fire synchronously from useQuery during other components'
    // renders, so setState here would be a setState-during-render violation.
    // Coalesce them into one animation frame outside the render phase.
    let frame = 0;
    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    }

    update();
    const unsubscribe = queryCache.subscribe(scheduleUpdate);
    const interval = window.setInterval(update, 1_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [queryClient]);

  return diagnostics;
}

/** Collapses queries that share a label (same procedure, different inputs)
 * into one row with a count, so `alerts.list ×4` doesn't fill the tooltip. */
function groupQueriesByLabel(queries: QueryDiagnostic[]) {
  const counts = new Map<string, number>();
  for (const query of queries) {
    counts.set(query.label, (counts.get(query.label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

function QueryTooltip({
  title,
  queries,
  footer,
  children,
}: {
  title: string;
  queries: QueryDiagnostic[];
  footer?: string;
  children: React.ReactNode;
}) {
  const groups = groupQueriesByLabel(queries);
  const visibleGroups = groups.slice(0, 8);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="flex cursor-help items-center gap-1.25" />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1.5">
        <span className="font-medium">{title}</span>
        {visibleGroups.length > 0 ? (
          <ul className="flex max-w-72 flex-col gap-1">
            {visibleGroups.map((group) => (
              <li key={group.label} className="truncate">
                {group.label}
                {group.count > 1 && (
                  <span className="text-muted-foreground"> ×{group.count}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
        {groups.length > visibleGroups.length && (
          <span className="text-muted-foreground">
            +{groups.length - visibleGroups.length} more
          </span>
        )}
        {footer && <span className="text-muted-foreground">{footer}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Development-only controls that sit in the dashboard canvas above the main
 * inset. Keeping the bar in flow means it follows the inset when Foggy resizes
 * it instead of floating over either surface. Renders nothing in production. */
export function DevBar() {
  if (!DEV) return null;
  return <DevBarInner />;
}

function DevBarInner() {
  // Session-only: a reload restores the strip, so it cannot be lost.
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return <DevBarContent onHide={() => setHidden(true)} />;
}

function DevBarContent({ onHide }: { onHide: () => void }) {
  const variant = useNavIconVariant();
  const ttft = useTtftVariant();
  const fps = useFramesPerSecond();
  const queries = useQueryDiagnostics();
  const queryClient = useQueryClient();
  const netDelay = useDevNetworkDelay();
  const netFail = useDevNetworkFail();
  const forceLoading = useDevForceLoading();
  const netActive = netDelay > 0 || netFail || forceLoading;
  // fps === 0 is the pre-first-sample state, not actual jank.
  const lowFps = fps > 0 && fps < 30;

  return (
    <div
      role="toolbar"
      aria-label="Development controls"
      aria-orientation="horizontal"
      className="flex h-8 shrink-0 items-center justify-end gap-4 px-1"
    >
      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex gap-1.25 items-center text-xs group text-foreground transition-all cursor-pointer">
            <IconLayoutSidebar
              data-icon="inline-start"
              className="size-3.25 text-muted-foreground opacity-80 group-hover:text-foreground group-hover:opacity-100"
            />
            Sidebar icons
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={variant}
              onValueChange={(value) =>
                setNavIconVariant(value as NavIconVariant)
              }
            >
              <DropdownMenuRadioItem value="chip">Chips</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="simple">
                Simple
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex gap-1.25 items-center text-xs group text-foreground transition-all cursor-pointer">
            <IconClockBolt
              data-icon="inline-start"
              className="size-3.25 text-muted-foreground opacity-80 group-hover:text-foreground group-hover:opacity-100"
            />
            TTFT bar
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={ttft}
              onValueChange={(value) => setTtftVariant(value as TtftVariant)}
            >
              {TTFT_VARIANTS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <div
            className={`flex gap-1.25 items-center text-xs group transition-all cursor-pointer ${
              netActive ? "text-destructive" : "text-foreground"
            }`}
          >
            <IconWifi
              data-icon="inline-start"
              className={`size-4 ${
                netActive
                  ? "text-destructive"
                  : "text-muted-foreground opacity-80 group-hover:text-foreground group-hover:opacity-100"
              }`}
              strokeWidth={1.75}
            />
            Network
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Added latency</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(netDelay)}
              onValueChange={(value) =>
                setDevNetworkDelay(Number(value) as DevNetworkDelay)
              }
            >
              {DEV_NETWORK_DELAYS.map((delay) => (
                <DropdownMenuRadioItem key={delay} value={String(delay)}>
                  {formatDelay(delay)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={netFail}
              onCheckedChange={setDevNetworkFail}
            >
              Fail {Math.round(DEV_NETWORK_FAIL_RATE * 100)}% of requests
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={forceLoading}
              onCheckedChange={(checked) => {
                setDevForceLoading(checked);
                if (!checked) {
                  // Abandon the never-resolving fetches, then refetch for real.
                  void queryClient
                    .cancelQueries()
                    .then(() => queryClient.invalidateQueries());
                }
              }}
            >
              Force loading state
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-muted-foreground"
        aria-label={`${fps} frames per second, ${queries.stale.length} stale queries, ${queries.fetching.length} queries fetching`}
      >
        <span className="flex items-center gap-1.25" aria-hidden>
          {lowFps ? (
            <IconGaugeFilled className="size-3.25 text-destructive" />
          ) : (
            <IconGauge className="size-3.25 text-muted-foreground opacity-80" />
          )}
          <span
            className={
              lowFps ? "text-destructive -mr-px" : "text-foreground -mr-px"
            }
          >
            {fps}
          </span>{" "}
          FPS
        </span>
        <TooltipProvider delay={150}>
          <QueryTooltip
            title="Stale queries"
            queries={queries.stale}
            footer={
              queries.staleInactive > 0
                ? `+${queries.staleInactive} inactive (no observers)`
                : undefined
            }
          >
            <IconClockExclamation className="size-3.25 text-muted-foreground opacity-80" />
            <span className="text-foreground -mr-px">
              {queries.stale.length}
            </span>{" "}
            stale
          </QueryTooltip>
          <QueryTooltip title="Fetching queries" queries={queries.fetching}>
            <IconDatabaseSearch className="size-3.25 text-muted-foreground opacity-80" />
            <span className="text-foreground -mr-px">
              {queries.fetching.length}
            </span>{" "}
            fetching
          </QueryTooltip>
        </TooltipProvider>
      </div>

      <TooltipProvider delay={0}>
        <div className="flex items-center -ml-1.5 gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => queryClient.invalidateQueries()}
                  aria-label="Invalidate all queries"
                  className="text-muted-foreground opacity-80"
                />
              }
            >
              <IconRefresh className="size-3.25" />
            </TooltipTrigger>
            <TooltipContent>Invalidate all queries</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => queryClient.clear()}
                  aria-label="Clear query cache"
                  className="text-muted-foreground opacity-80"
                />
              }
            >
              <IconTrash className="size-3.25" />
            </TooltipTrigger>
            <TooltipContent>Clear query cache</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onHide}
                  aria-label="Hide development controls until reload"
                  className="text-muted-foreground opacity-80"
                />
              }
            >
              <IconArrowUp className="size-3.25" />
            </TooltipTrigger>
            <TooltipContent>Hide until reload</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
