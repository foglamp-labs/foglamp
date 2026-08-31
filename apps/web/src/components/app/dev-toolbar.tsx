"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
  IconClock,
  IconClockExclamation,
  IconClockOff,
  IconDatabaseSearch,
  IconGauge,
  IconGaugeFilled,
  IconHourglass,
  IconLoader,
  IconAlertTriangle,
  IconBellRinging,
  IconCalendarOff,
  IconCalendarWeek,
  IconConfetti,
  IconDatabaseExclamation,
  IconKey,
  IconMail,
  IconMailBolt,
  IconMailFast,
  IconPlugConnectedX,
  IconUserPlus,
  IconWand,
  IconRefresh,
  IconTrash,
  IconWifi,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

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
// Dev-only simulated network conditions live in utils/dev-network.ts; the
// hooks below subscribe to that store. In production the toolbar renders
// nothing.

const DEV = process.env.NODE_ENV === "development";

// Simulated network conditions (store lives in utils/dev-network.ts so the
// tRPC client can read it without importing component code). One hook per
// value keeps useSyncExternalStore snapshots primitive.

function useDevNetworkDelay(): DevNetworkDelay {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevNetworkDelay,
    () => 0,
  );
}

function useDevNetworkFail(): boolean {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevNetworkFail,
    () => false,
  );
}

function useDevForceLoading(): boolean {
  return useSyncExternalStore(
    subscribeDevNetwork,
    readDevForceLoading,
    () => false,
  );
}

function formatDelay(delay: DevNetworkDelay) {
  if (delay === 0) return "Off";
  return delay < 1_000 ? `+${delay} ms` : `+${delay / 1_000} s`;
}

function delayIcon(delay: DevNetworkDelay) {
  if (delay === 0) return IconClockOff;
  return delay < 1_000 ? IconClock : IconHourglass;
}

// Dev-bar menus are dense: the items drop to the toolbar's text size and
// their leading icons shrink to match.
// The dropdown component sizes bare svgs to size-4 with a higher-specificity
// [&_svg:not([class*='size-'])] rule, so the icon size must live on the
// icons themselves (MENU_ICON), not on the item.
const MENU_ITEM = "text-xs [&_svg]:text-muted-foreground";
const MENU_ICON = "size-3.5";

// One entry per email the product sends, grouped the way the templates relate.
// Sends go to the server's TEST_EMAIL_TO address.
const TEST_EMAIL_GROUPS = [
  {
    label: "Alerts",
    items: [
      { variant: "alert_fired", label: "Fired alert (plain)", icon: IconBellRinging },
      { variant: "alert_diagnosis", label: "Fired alert + diagnosis", icon: IconMailBolt },
    ],
  },
  {
    label: "Digest",
    items: [
      { variant: "weekly_digest", label: "Weekly digest", icon: IconCalendarWeek },
      { variant: "quiet_week", label: "Quiet week", icon: IconCalendarOff },
    ],
  },
  {
    label: "Onboarding",
    items: [
      { variant: "welcome", label: "Welcome", icon: IconConfetti },
      { variant: "onboarding_day_1", label: "Follow-up (day 1)", icon: IconMailFast },
      { variant: "onboarding_day_3", label: "Follow-up (day 3)", icon: IconMailFast },
      { variant: "onboarding_day_7", label: "Follow-up (day 7)", icon: IconMailFast },
    ],
  },
  {
    label: "Account",
    items: [
      { variant: "magic_link", label: "Magic link", icon: IconWand },
      { variant: "reset_password", label: "Reset password", icon: IconKey },
      { variant: "invitation", label: "Org invitation", icon: IconUserPlus },
    ],
  },
  {
    label: "Usage",
    items: [
      { variant: "quota_warning", label: "Quota warning", icon: IconAlertTriangle },
      { variant: "storage_alert", label: "Storage alert", icon: IconDatabaseExclamation },
    ],
  },
] as const;

function TestEmailsMenu() {
  const sendTest = useMutation(
    trpc.testEmails.send.mutationOptions({
      onSuccess: (data) => toast.success(`Test email sent to ${data.to}`),
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="group flex cursor-pointer items-center gap-1.25 text-xs text-foreground transition-all">
          <IconMail
            data-icon="inline-start"
            className="size-4 text-muted-foreground opacity-80 group-hover:text-foreground group-hover:opacity-100"
            strokeWidth={1.75}
          />
          Emails
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit">
        {TEST_EMAIL_GROUPS.map((group, index) => (
          <DropdownMenuGroup key={group.label}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.variant}
                className={MENU_ITEM}
                disabled={sendTest.isPending}
                onClick={() => sendTest.mutate({ variant: item.variant })}
              >
                <item.icon className={MENU_ICON} />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
        (query) => query.state.data !== undefined && query.isStale(),
      );
      const observedStale = allStale.filter(
        (query) => query.getObserversCount() > 0,
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
          : next,
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

// Exit is staged: the controls fade out first, then the bar's height (and the
// canvas gap it occupies) collapses so the inset grows into the space in one
// smooth motion instead of jumping.
const FADE_S = 0.1;
const COLLAPSE_S = 0.25;

function DevBarInner() {
  // Session-only: a reload restores the strip, so it cannot be lost.
  const [hidden, setHidden] = useState(false);
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          key="dev-bar"
          // Cancels the wrapper's `gap-2` as the bar collapses so the inset ends
          // up exactly where it sits in production (no dev bar at all).
          initial={false}
          exit={{
            height: 0,
            marginBottom: "-0.5rem",
            transition: {
              delay: FADE_S,
              duration: COLLAPSE_S,
              ease: [0.4, 0, 0.2, 1],
            },
          }}
          className="h-8 shrink-0 overflow-hidden"
        >
          <motion.div
            exit={{ opacity: 0, transition: { duration: FADE_S } }}
            className="h-full"
          >
            <DevBarContent onHide={() => setHidden(true)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DevBarContent({ onHide }: { onHide: () => void }) {
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

      <TestEmailsMenu />

      <DropdownMenu>
        <DropdownMenuTrigger>
          <div
            className={`flex gap-1.25 items-center text-xs group transition-all cursor-pointer ${
              netActive ? "text-destructive" : "text-foreground"
            }`}
          >
            <IconWifi
              data-icon="inline-start"
              className={`size-4.5 ${
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
              {DEV_NETWORK_DELAYS.map((delay) => {
                const Icon = delayIcon(delay);
                return (
                  <DropdownMenuRadioItem
                    key={delay}
                    value={String(delay)}
                    className={MENU_ITEM}
                  >
                    <Icon className={MENU_ICON} />
                    {formatDelay(delay)}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={netFail}
              onCheckedChange={setDevNetworkFail}
              className={MENU_ITEM}
            >
              <IconPlugConnectedX className={MENU_ICON} />
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
              className={MENU_ITEM}
            >
              <IconLoader className={MENU_ICON} />
              Force loading state
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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
