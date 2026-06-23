"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { formatCost, formatDuration, formatTokens, formatTps } from "./format";
import {
  rows,
  type HudRow,
  type HudStep,
  type HudToolCall,
  type HudTrace,
} from "./model";
import { ModelLogo, formatModelName } from "./model-logo";
import { HUD_CSS } from "./styles";
import { useHudStream, type ConnStatus } from "./useHudStream";

export interface FoglampHUDProps {
  /** Broker port — must match `foglamp({ hudPort })`. Default 8517. */
  port?: number;
  /**
   * Full SSE endpoint to connect to (absolute URL or same-origin path like
   * `/hud/events`). Overrides `port` and the default `http://127.0.0.1:<port>`.
   * Use when the broker is reached through a proxy on the page's own origin —
   * e.g. a hosted demo where the dev-only loopback default can't apply.
   */
  url?: string;
  /** Start expanded (otherwise starts as the pill). Default false. */
  defaultOpen?: boolean;
  /** Color theme. "system" follows the host app (its `.dark` class) / OS. Default "system". */
  theme?: "light" | "dark" | "system";
  /** Mask prompt/response/tool payloads on screen — set before recording or screen-sharing. */
  redact?: boolean;
}

type Mode = "pill" | "expanded";
type StatusKind = "" | "run" | "err";

const DEFAULT_PORT = 8517;
// The timeline's auto-follow scroll must run synchronously after the DOM grows
// (before paint) so the scroll position and the wider track commit together — an
// async useEffect leaves a one-frame gap where the grid lines jump. Fall back to
// useEffect on the server to avoid the SSR layout-effect warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
// Shell size springs — pill↔expanded is fast + snappy; list↔detail a touch
// softer. Driven by the vendored micro-spring below (no motion dependency).
// Views themselves just cross-fade (CSS, see .fl-mode).
const SPRING_PILL = { stiffness: 620, damping: 42 } as const;
const SPRING_VIEW = { stiffness: 540, damping: 44 } as const;

type Size = { w: number; h: number };
type SpringParams = { stiffness: number; damping: number };

/**
 * A tiny rAF spring that tweens width+height toward a target — the morph's whole
 * reason for ever needing `motion`. The first target snaps (no animation on
 * mount); later targets spring with a small overshoot (damping < critical).
 * Integrated at a fixed 1/240s sub-step so the stiff springs stay stable
 * regardless of frame rate. Retargets mid-flight (reads the latest target/params
 * via refs). No `Date.now`/`Math.random` — rAF timestamps only.
 */
function useSizeSpring(target: Size | undefined, params: SpringParams): Size | undefined {
  const [val, setVal] = useState<Size | undefined>(target);
  const cur = useRef<{ w: number; h: number; vw: number; vh: number } | null>(null);
  const targetRef = useRef(target);
  const paramsRef = useRef(params);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  targetRef.current = target;
  paramsRef.current = params;

  useEffect(() => {
    if (!target) return;
    // First measured size: snap into place, no animation.
    if (!cur.current) {
      cur.current = { w: target.w, h: target.h, vw: 0, vh: 0 };
      setVal({ w: target.w, h: target.h });
      return;
    }
    if (raf.current != null) return; // a loop is already chasing the (updated) target
    last.current = 0;
    const tick = (ts: number) => {
      const s = cur.current!;
      const tg = targetRef.current!;
      const { stiffness, damping } = paramsRef.current;
      let dt = last.current ? (ts - last.current) / 1000 : 1 / 60;
      last.current = ts;
      dt = Math.min(dt, 0.064); // clamp tab-switch gaps
      for (let t = dt; t > 0; t -= 1 / 240) {
        const h = Math.min(t, 1 / 240);
        s.vw += (-stiffness * (s.w - tg.w) - damping * s.vw) * h;
        s.w += s.vw * h;
        s.vh += (-stiffness * (s.h - tg.h) - damping * s.vh) * h;
        s.h += s.vh * h;
      }
      const settled =
        Math.abs(s.w - tg.w) < 0.5 && Math.abs(s.vw) < 1 &&
        Math.abs(s.h - tg.h) < 0.5 && Math.abs(s.vh) < 1;
      if (settled) {
        s.w = tg.w; s.h = tg.h; s.vw = 0; s.vh = 0;
        setVal({ w: tg.w, h: tg.h });
        raf.current = null;
        return;
      }
      setVal({ w: s.w, h: s.h });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [target?.w, target?.h]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  return val;
}

// Per-agent bar colors for the timeline — a stable hash so the same agent keeps
// its color across runs (an error run overrides to the error red).
const TL_PALETTE = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
];
function tlColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TL_PALETTE[h % TL_PALETTE.length]!;
}

// Error runs override to a fixed rose (reads on both themes); fine as a hex
// since the timeline bars set `background` directly.
const TL_ERROR = "#f43f5e";

// Per-agent glyphs — simple filled shapes that read at ~12px. Paired with a
// separate hash (multiplier 37 vs the color's 31) so each agent gets an
// independent, stable (icon, color) from the two pools.
const TL_ICONS = [
  "M13 2 4 14h6l-1 8 9-12h-6z", // bolt
  "M12 2c.6 5.4 2.9 7.7 8.3 8.3-5.4.6-7.7 2.9-8.3 8.3-.6-5.4-2.9-7.7-8.3-8.3 5.4-.6 7.7-2.9 8.3-8.3z", // sparkle
  "M12 2 21 12 12 22 3 12z", // diamond
  "M12 3 22 20H2z", // triangle
  "M12 2.4 20.6 7.2v9.6L12 21.6 3.4 16.8V7.2z", // hexagon
  "M9.5 3h5a6.5 6.5 0 0 1 6.5 6.5v5a6.5 6.5 0 0 1-6.5 6.5h-5A6.5 6.5 0 0 1 3 14.5v-5A6.5 6.5 0 0 1 9.5 3z", // squircle
  "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z", // plus
  "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z", // circle
];
function tlIcon(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 37 + key.charCodeAt(i)) >>> 0;
  return TL_ICONS[h % TL_ICONS.length]!;
}

// A bg-cutout warning triangle (filled triangle with an evenodd "!" punched
// out) — shown on error pills instead of the agent glyph.
const WARN_GLYPH = "M12 3 22.5 21H1.5z M11 9h2v6h-2z M11 16.5h2v2.5h-2z";

// Errors in a trace = failed tool calls + failed steps (≥1 if the run itself
// errored without a pinpointed sub-failure).
function errorCount(t: HudTrace): number {
  const n =
    t.tools.filter((x) => x.status === "error").length +
    t.steps.filter((x) => x.status === "error").length;
  return n > 0 ? n : t.status === "error" ? 1 : 0;
}

function traceColor(t: HudTrace): string {
  return t.status === "error" ? TL_ERROR : tlColor(t.agentName ?? t.name);
}

// The timeline shows a fixed 1-minute window; longer sessions scroll. Zoom is
// constant (1 min = the viewport), so runs whose starts land within ~2.7s pile
// up on the same spot → cluster them into one marker.
const WINDOW_MS = 60_000;
const CLUSTER_GAP_MS = WINDOW_MS * 0.045;
const TICK_MS = 15_000; // vertical grid every 15s
// A little gutter past `now` on the right so the live pill isn't glued to the
// edge. In the time domain (not CSS padding, which a scroll container eats at
// the scroll-end); scales with zoom to a constant ~14px.
const RIGHT_PAD_MS = WINDOW_MS * 0.035;

/** Compact "how long ago" label for an axis tick (0 = now). */
function tickLabel(ago: number): string {
  if (ago === 0) return "now";
  const s = Math.round(ago / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

/** Group runs whose starts are within CLUSTER_GAP_MS (time-sorted, ascending). */
function clusterRuns(traces: HudTrace[]): HudTrace[][] {
  const sorted = [...traces].sort((a, b) => a.startedAt - b.startedAt);
  const groups: HudTrace[][] = [];
  for (const t of sorted) {
    const last = groups[groups.length - 1];
    if (last && t.startedAt - last[last.length - 1]!.startedAt <= CLUSTER_GAP_MS) {
      last.push(t);
    } else {
      groups.push([t]);
    }
  }
  return groups;
}

/**
 * Floating overlay that streams live agent execution from the local Foglamp
 * broker. Renders into a Shadow DOM root appended to <body> so its styles are
 * fully isolated from (and can't be restyled by) the host app. Dev-only: inert
 * unless a broker is running (`foglamp({ hud: true })`).
 */
export function FoglampHUD(props: FoglampHUDProps): ReactNode {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("foglamp-hud");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = HUD_CSS;
    shadow.appendChild(style);
    const mountEl = document.createElement("div");
    shadow.appendChild(mountEl);
    document.body.appendChild(host);
    hostRef.current = host;
    setMount(mountEl);
    return () => {
      host.remove();
      hostRef.current = null;
    };
  }, []);

  const theme = useResolvedTheme(props.theme ?? "system");
  useEffect(() => {
    hostRef.current?.setAttribute("data-theme", theme);
  }, [theme, mount]);

  if (!mount) return null;
  return createPortal(<HudApp {...props} />, mount);
}

/** Resolve the active theme, following the host app's `.dark`/`data-theme` and OS. */
function useResolvedTheme(
  theme: "light" | "dark" | "system"
): "light" | "dark" {
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (theme !== "system") {
      setResolved(theme);
      return;
    }
    const root = document.documentElement;
    const compute = (): "light" | "dark" => {
      if (root.classList.contains("dark")) return "dark";
      if (root.classList.contains("light")) return "light";
      const attr = root.getAttribute("data-theme");
      if (attr === "dark" || attr === "light") return attr;
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    };
    setResolved(compute());
    const mo = new MutationObserver(() => setResolved(compute()));
    mo.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(compute());
    mq.addEventListener("change", onChange);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, [theme]);
  return resolved;
}

function HudApp(props: FoglampHUDProps) {
  const port = props.port ?? DEFAULT_PORT;
  const { state, conn } = useHudStream(port, props.url);
  const [mode, setMode] = useState<Mode>(
    props.defaultOpen ? "expanded" : "pill"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Slide direction for the list↔detail transition: +1 forward (into a run),
  // -1 back (to the list), 0 for pill ↔ expanded (fade only).
  const [direction, setDirection] = useState(0);
  const traces = state.traces;
  const running = traces.some((t) => t.status === "running");
  const pillStatus: StatusKind = running
    ? "run"
    : traces[0]?.status === "error"
      ? "err"
      : "";

  // Tick while running so live durations advance. ~100ms (under the bars'
  // 0.2s CSS transition) so the timeline reads as continuous motion rather than
  // stepping every quarter-second.
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [running]);

  const expand = () => {
    // Open to the trace list; tap a run to drill into its detail.
    setDirection(0);
    setSelectedId(null);
    setMode("expanded");
  };
  const select = (id: string) => {
    setDirection(1);
    setSelectedId(id);
  };
  const back = () => {
    setDirection(-1);
    setSelectedId(null);
  };
  const collapse = () => {
    setDirection(0);
    setMode("pill");
  };

  // Esc steps back: detail → list → pill.
  useEffect(() => {
    if (mode !== "expanded") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedId) back();
      else collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedId]);

  const selected = selectedId
    ? traces.find((t) => t.traceId === selectedId)
    : undefined;
  const viewKey =
    mode === "pill" ? "pill" : selected ? `detail:${selected.traceId}` : "list";

  return (
    <Morph dataMode={mode} viewKey={viewKey} direction={direction}>
      {mode === "pill" ? (
        <Pill count={state.sessionCount} status={pillStatus} onExpand={expand} />
      ) : selected ? (
        <TraceDetail
          trace={selected}
          redact={props.redact ?? false}
          onBack={back}
          onCollapse={collapse}
        />
      ) : (
        <TraceList
          traces={traces}
          sessionCount={state.sessionCount}
          conn={conn}
          status={pillStatus}
          onSelect={select}
          onCollapse={collapse}
        />
      )}
    </Morph>
  );
}

/**
 * The shell springs its width/height to the *entering* view's measured size
 * (snapped on first paint, tweened after). Views cross-fade via CSS: the inner
 * `.fl-mode` is keyed on the view, so React remounts it on every change and its
 * fade-in keyframe replays. Measuring the entering element directly (it's
 * `width: max-content`, so its natural size is unaffected by the shell's
 * animated width) lets the shell resize from the start of the transition.
 */
function Morph({
  dataMode,
  viewKey,
  direction,
  children,
}: {
  dataMode: Mode;
  viewKey: string;
  direction: number;
  children: ReactNode;
}) {
  const [size, setSize] = useState<Size>();
  const roRef = useRef<ResizeObserver | null>(null);

  // Measure the entering view directly and keep tracking it (live streaming rows
  // grow the list). `.fl-mode` is `width: max-content`, so this reads the view's
  // natural size even while the shell's own width is mid-spring.
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    roRef.current?.disconnect();
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  const animSize = useSizeSpring(size, direction === 0 ? SPRING_PILL : SPRING_VIEW);

  return (
    <div
      className="fl-shell"
      data-mode={dataMode}
      style={animSize ? { width: animSize.w, height: animSize.h } : undefined}
    >
      <div key={viewKey} ref={measureRef} className="fl-mode">
        {children}
      </div>
    </div>
  );
}

function Pill({
  count,
  status,
  onExpand,
}: {
  count: number;
  status: StatusKind;
  onExpand: () => void;
}) {
  return (
    // The whole pill (brand, count, diamond) is the expand target.
    <div
      className="fl-pill"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      aria-label="Expand Foglamp HUD"
    >
      <BrandMark className="fl-brand" />
      {count > 0 && <span className="fl-count">{count}</span>}
      <Diamond status={status} />
    </div>
  );
}

// A small colored circle with the agent's glyph — the agent's identity, shared
// with the timeline (same color + icon hashes). Pure identity, no error tint.
function AgentBadge({ name }: { name: string }) {
  return (
    <span className="fl-agent-badge" style={{ background: tlColor(name) }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={tlIcon(name)} />
      </svg>
    </span>
  );
}

/**
 * A live timeline of the session's runs on a single shared axis: every run is a
 * pill on one line (concurrent runs overlap), tagged with the agent's icon and
 * color so you can tell them apart. While a run is live the window tracks `now`
 * (auto-scaling) and the pills CSS-transition so the ~100ms ticks read as
 * continuous motion. Tap a pill to open its detail.
 */
function TraceTimeline({
  traces,
  onSelect,
  scrollRef,
  onScroll,
  followingRef,
}: {
  traces: HudTrace[];
  onSelect: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  followingRef: RefObject<boolean>;
}) {
  // Freeze `now` whenever we're not live-following, so scrolling back to a past
  // period shows a fully static chart (no axis creep) until you return to the edge.
  const frozenNow = useRef(Date.now());
  const liveNow = Date.now();
  const now = followingRef.current ? liveNow : frozenNow.current;
  if (followingRef.current) frozenNow.current = liveNow;

  const sessionStart = traces.length ? Math.min(...traces.map((t) => t.startedAt)) : now;
  const dataMs = Math.max(now - sessionStart, WINDOW_MS);
  const windowStart = now - dataMs; // left edge = oldest run (or 1 min back)
  const totalMs = dataMs + RIGHT_PAD_MS; // track spans the data + the right gutter
  const clusters = clusterRuns(traces);

  // Lay the track out in FIXED pixels (a constant px/ms scale), not % of a
  // growing track. With %, each tick the content drifts sub-pixel while the
  // integer scrollLeft steps — the two never agree and the chart "dances" ±1px.
  // Fixed px + wall-clock-anchored grid lines hold everything still; only the
  // scroll advances to follow `now`.
  const [vw, setVw] = useState(0);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);
  const pxPerMs = vw > 0 ? vw / WINDOW_MS : 0;
  const trackW = totalMs * pxPerMs;
  const x = (t: number) => (t - windowStart) * pxPerMs; // px from the track's left

  // 15s grid at wall-clock-aligned times (fixed positions), labelled by age.
  const ticks: number[] = [];
  for (let g = Math.ceil(windowStart / TICK_MS) * TICK_MS; g <= now; g += TICK_MS) ticks.push(g);

  // Follow the right edge while `following`; layout-effect re-pins atomically
  // with the track growth (an async effect would leave a one-frame jump).
  const didInit = useRef(false);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (!didInit.current) {
      el.scrollLeft = max;
      didInit.current = true;
      return;
    }
    if (followingRef.current) el.scrollLeft = max;
  }, [scrollRef, trackW, traces.length, followingRef]);

  if (traces.length === 0) return null;

  return (
    <div className="fl-timeline">
      <div className="fl-tl-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="fl-tl-inner" style={{ width: `${trackW}px` }}>
          <div className="fl-tl-track">
            <span className="fl-tl-axis" />
            {ticks.map((g) => (
              <span key={`g${g}`} className="fl-tl-grid" style={{ left: `${x(g)}px` }} />
            ))}
            <span className="fl-tl-grid now" style={{ left: `${x(now)}px` }} />
            {clusters.map((group) => {
              const left = x(group[0]!.startedAt);
            if (group.length === 1) {
              const t = group[0]!;
              const key = t.agentName ?? t.name;
              const isErr = t.status === "error";
              const end = t.endedAt ?? now;
              const width = Math.max((end - t.startedAt) * pxPerMs, 0);
              return (
                <button
                  key={t.traceId}
                  type="button"
                  className={`fl-tl-bar ${t.status === "running" ? "run" : ""}`}
                  style={{ left: `${left}px`, width: `${width}px`, background: traceColor(t) }}
                  onClick={() => onSelect(t.traceId)}
                  title={`${key} · ${formatDuration(end - t.startedAt)}`}
                >
                  <svg className="fl-tl-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d={isErr ? WARN_GLYPH : tlIcon(key)}
                      fillRule={isErr ? "evenodd" : "nonzero"}
                    />
                  </svg>
                </button>
              );
            }
            // Concurrent runs collapse into one marker (latest opens on click).
            // The marker spans the group's full extent: earliest start → latest end.
            const latest = group.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
            const names = group.map((t) => t.agentName ?? t.name).join(", ");
            const gEnd = Math.max(...group.map((t) => t.endedAt ?? now));
            const cWidth = Math.max((gEnd - group[0]!.startedAt) * pxPerMs, 0);
            return (
              <button
                key={group.map((t) => t.traceId).join("|")}
                type="button"
                className="fl-tl-cluster"
                style={{ left: `${left}px`, width: `${cWidth}px` }}
                onClick={() => onSelect(latest.traceId)}
                title={`${group.length} runs · ${names}`}
              >
                <span className="fl-tl-cdots">
                  {group.slice(0, 3).map((t) => {
                    const isErr = t.status === "error";
                    return (
                      <span
                        key={t.traceId}
                        className="fl-tl-cdot"
                        style={{ background: traceColor(t) }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d={isErr ? WARN_GLYPH : tlIcon(t.agentName ?? t.name)}
                            fillRule={isErr ? "evenodd" : "nonzero"}
                          />
                        </svg>
                      </span>
                    );
                  })}
                </span>
                <span className="fl-tl-cn">{group.length}</span>
              </button>
            );
            })}
          </div>
          <div className="fl-tl-axislabels">
            {ticks
              .filter((g) => now - g >= TICK_MS / 2) // skip marks hugging the now-tag
              .map((g) => (
                <span key={`l${g}`} className="fl-tl-tick" style={{ left: `${x(g)}px` }}>
                  {tickLabel(now - g)}
                </span>
              ))}
            <span className="fl-tl-tick now" style={{ left: `${x(now)}px` }}>
              now
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The session's traces, newest first — tap one to open its detail. */
function TraceList({
  traces,
  sessionCount,
  conn,
  status,
  onSelect,
  onCollapse,
}: {
  traces: HudTrace[];
  sessionCount: number;
  conn: ConnStatus;
  status: StatusKind;
  onSelect: (id: string) => void;
  onCollapse: () => void;
}) {
  // The chart and the list scroll independently (a previous chart↔list sync fed
  // back into itself every tick and made the list jitter up/down). Live-follow
  // only while the chart is parked at the right edge (now); scrolling it left to
  // a past period sets `following` false, which both stops auto-advance and
  // freezes `now` (see TraceTimeline) until you scroll back to the edge.
  const chartRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const onChartScroll = () => {
    const c = chartRef.current;
    if (!c) return;
    const cMax = c.scrollWidth - c.clientWidth;
    following.current = cMax <= 1 || cMax - c.scrollLeft < 24;
  };

  return (
    <div className="fl-panel" role="dialog" aria-label="Foglamp traces">
      <div className="fl-header fl-header-list">
        <div className="fl-title">
          <b>Traces</b>
          <span>
            {sessionCount > 0
              ? `${sessionCount} this session`
              : conn === "open"
                ? "Waiting for a run…"
                : "connecting…"}
          </span>
        </div>
        <Diamond status={status} />
        <button
          type="button"
          className="fl-icon-btn"
          onClick={onCollapse}
          aria-label="Collapse"
        >
          <ChevronDown />
        </button>
      </div>

      <TraceTimeline
        traces={traces}
        onSelect={onSelect}
        scrollRef={chartRef}
        onScroll={onChartScroll}
        followingRef={following}
      />

      <div className="fl-list">
        {traces.length === 0 ? (
          <div className="fl-empty">
            <span className="fl-listening" aria-hidden="true">
              <span />
              <span />
            </span>
            <p>{conn === "open" ? "Listening for runs…" : "Connecting to the broker…"}</p>
          </div>
        ) : (
          // Plain rows (no per-row animation): the Morph already fades the whole
          // view in, so animating rows here made them rise from the bottom on
          // entry and lag the list on leave.
          traces.map((t) => {
            const errs = errorCount(t);
            const toolCount = t.tools.length;
            return (
              <button
                key={t.traceId}
                type="button"
                className="fl-list-row"
                onClick={() => onSelect(t.traceId)}
              >
                <div className="fl-list-main">
                  <span className="fl-list-name">
                    <AgentBadge name={t.agentName ?? t.name} />
                    <span className="fl-list-agent">{t.agentName ?? t.name}</span>
                  </span>
                  <span className="fl-list-sub">
                    <ModelLogo
                      provider={t.provider}
                      modelId={t.model}
                      className="fl-model-icon"
                    />
                    <span className="fl-list-model">{formatModelName(t.model)}</span>
                    {toolCount > 0 && (
                      <span className="fl-list-tools">
                        · {toolCount} {toolCount === 1 ? "tool" : "tools"}
                      </span>
                    )}
                  </span>
                </div>
                {t.status === "running" ? (
                  <span className="fl-list-loading" title="Running">
                    <Diamond status="run" />
                  </span>
                ) : (
                  errs > 0 && (
                    <span
                      className="fl-err-badge"
                      title={`${errs} error${errs === 1 ? "" : "s"}`}
                    >
                      <WarnIcon />
                      {errs}
                    </span>
                  )
                )}
                <span className="fl-list-meta">
                  <span>{formatCost(t.totals?.costUsd)}</span>
                  <span>{formatDuration(traceDuration(t))}</span>
                </span>
                <ChevronRight />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** One trace's live execution: header (back + model), tool armory, call tree, totals. */
function TraceDetail({
  trace,
  redact,
  onBack,
  onCollapse,
}: {
  trace: HudTrace;
  redact: boolean;
  onBack: () => void;
  onCollapse: () => void;
}) {
  const treeRef = useRef<HTMLDivElement>(null);
  const rowList = rows(trace);
  // Shared time axis for the waterfall bars.
  const now = Date.now();
  const tStart = trace.startedAt;
  const tDur = Math.max((trace.endedAt ?? now) - tStart, 1);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  useEffect(() => {
    const el = treeRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rowList.length]);

  return (
    <div className="fl-panel fl-panel-detail" role="dialog" aria-label="Foglamp trace">
      <div className="fl-header">
        <button
          type="button"
          className="fl-icon-btn"
          onClick={onBack}
          aria-label="Back to traces"
        >
          <ChevronLeft />
        </button>
        <div className="fl-title">
          <span className="fl-title-top">
            <AgentBadge name={trace.agentName ?? trace.name} />
            <b>{trace.agentName ?? trace.name}</b>
          </span>
          <span className="fl-model">
            <ModelLogo
              provider={trace.provider}
              modelId={trace.model}
              className="fl-model-icon"
              size={11}
            />
            {formatModelName(trace.model)}
          </span>
        </div>
        <Diamond status={statusKind(trace)} />
        <button
          type="button"
          className="fl-icon-btn"
          onClick={onCollapse}
          aria-label="Collapse"
        >
          <ChevronDown />
        </button>
      </div>

      {trace.toolNames.length > 0 && (
        <div className="fl-armory">
          {trace.toolNames.map((name) => {
            const used = trace.tools.some((t) => t.toolName === name);
            return (
              <span key={name} className={used ? "fl-chip used" : "fl-chip"}>
                <span className="fl-chip-ico">{toolGlyph(name)}</span>
                {name}
              </span>
            );
          })}
        </div>
      )}

      <div className="fl-tree" ref={treeRef}>
        {rowList.map((row) => {
          const isErr =
            row.kind === "step"
              ? row.step.status === "error"
              : row.tool.status === "error";
          const isOpen = open.has(row.key);
          return (
            <div
              key={row.key}
              className={`fl-row-item ${row.kind === "tool" ? "tool" : ""}`}
            >
              <button
                type="button"
                className={`fl-row ${isErr ? "err" : ""} ${isOpen ? "open" : ""}`}
                onClick={() => toggle(row.key)}
                aria-expanded={isOpen}
              >
                <WaterfallRow row={row} tStart={tStart} tDur={tDur} now={now} />
                <RowCaret open={isOpen} />
              </button>
              {/* Always rendered; the grid-rows 0fr→1fr trick animates open AND
                  close in pure CSS (height:auto is otherwise un-transitionable). */}
              <div className={`fl-row-detail ${isOpen ? "open" : ""}`}>
                <div className="fl-row-detail-inner">
                  {row.kind === "step" ? (
                    <StepDetail step={row.step} />
                  ) : (
                    <ToolDetail tool={row.tool} redact={redact} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Footer trace={trace} />
    </div>
  );
}

function statusKind(t: HudTrace): StatusKind {
  if (t.status === "running") return "run";
  if (t.status === "error") return "err";
  return "";
}

function traceDuration(t: HudTrace): number {
  return t.totals?.durationMs ?? (t.endedAt ?? Date.now()) - t.startedAt;
}

// One waterfall row: [icon + label] [time bar on a shared axis] [duration].
function WaterfallRow({
  row,
  tStart,
  tDur,
  now,
}: {
  row: HudRow;
  tStart: number;
  tDur: number;
  now: number;
}) {
  const isStep = row.kind === "step";
  const status = isStep ? row.step.status : row.tool.status;
  const isErr = status === "error";
  const isRun = status === "running";
  const start = isStep ? row.step.startedAt : row.tool.startedAt;
  const explicit = isStep ? row.step.durationMs : row.tool.durationMs;
  const dur = explicit ?? Math.max(now - start, 0);
  const left = Math.min(Math.max(((start - tStart) / tDur) * 100, 0), 100);
  const width = Math.max((dur / tDur) * 100, 0);
  const kind = isStep ? "step" : "tool";
  return (
    <>
      <span className={`fl-wf-label ${kind}`}>
        <span className={`fl-wf-ico ${isErr ? "err" : ""}`}>
          {isErr ? <WarnIcon /> : isStep ? <StepGlyph /> : toolGlyph(row.tool.toolName)}
        </span>
        <b>{isStep ? `Step ${row.step.stepNumber + 1}` : row.tool.toolName}</b>
        <span className="fl-wf-lead" aria-hidden="true" />
      </span>
      <span className="fl-wf-track">
        <span
          className={`fl-wf-bar ${kind} ${isErr ? "err" : ""} ${isRun ? "run" : ""}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </span>
      <span className="fl-wf-dur">{formatDuration(explicit ?? dur)}</span>
    </>
  );
}

// Step glyph — stacked layers.
function StepGlyph() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <path d="M12 3 3 7.5 12 12l9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

// Tool-call glyph by name convention: get/fetch/read, list, search/find/query
// get a recognizable icon; everything else gets a generic "call" mark.
function toolGlyph(name: string): ReactNode {
  const n = name.toLowerCase();
  if (/^(search|find|query|lookup)/.test(n)) return <SearchGlyph />;
  if (/^(list|ls|index|all)/.test(n)) return <ListGlyph />;
  if (/^(get|fetch|read|load)/.test(n)) return <GetGlyph />;
  return <CallGlyph />;
}

/** Expanded detail for a step row — all of its metrics. */
function StepDetail({ step }: { step: HudStep }) {
  const items: [string, string][] = [];
  if (step.ttftMs != null) items.push(["TTFT", formatDuration(step.ttftMs)]);
  items.push(["Duration", formatDuration(step.durationMs)]);
  if (step.outputTokens > 0)
    items.push(["Output", `${formatTokens(step.outputTokens)} tok`]);
  if (step.reasoningTokens)
    items.push(["Reasoning", `${formatTokens(step.reasoningTokens)} tok`]);
  if (step.outputTps != null)
    items.push(["Throughput", formatTps(step.outputTps)]);
  items.push(["Status", step.status]);
  return (
    <dl className="fl-kv">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Expanded detail for a tool row — its full input and output (or error). */
function ToolDetail({ tool, redact }: { tool: HudToolCall; redact: boolean }) {
  return (
    <div className="fl-io">
      {tool.input && (
        <IoBlock
          label="Input"
          value={redact ? "•••" : prettyJson(tool.input)}
        />
      )}
      {tool.status === "error" ? (
        <IoBlock
          label="Error"
          value={redact ? "•••" : (tool.errorMessage ?? "error")}
          error
        />
      ) : (
        tool.output && (
          <IoBlock
            label="Output"
            value={redact ? "•••" : prettyJson(tool.output)}
          />
        )
      )}
    </div>
  );
}

function IoBlock({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  error?: boolean;
}) {
  return (
    <div className={`fl-io-block ${error ? "err" : ""}`}>
      <span className="fl-io-label">{label}</span>
      <pre className="fl-io-pre">{value}</pre>
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function Footer({ trace }: { trace: HudTrace }) {
  const t = trace.totals;
  const outputTokens =
    t?.outputTokens ?? trace.steps.reduce((sum, s) => sum + s.outputTokens, 0);
  const durationMs = traceDuration(trace);
  const hasError = trace.status === "error";
  return (
    <div className="fl-footer">
      <div className="fl-stat tokens">
        <b>{formatTokens(outputTokens)}</b>
        <span>
          <TokensIcon /> tokens
        </span>
      </div>
      <div className="fl-stat cost">
        <b>{formatCost(t?.costUsd)}</b>
        <span>
          <CostIcon /> cost
        </span>
      </div>
      <div className={`fl-stat dur ${hasError ? "err" : ""}`}>
        <b>{formatDuration(durationMs)}</b>
        <span>
          <ClockIcon />{" "}
          {trace.status === "running"
            ? "running"
            : hasError
              ? "failed"
              : "done"}
        </span>
      </div>
    </div>
  );
}

// ---- Vendored assets (Shadow DOM = no Tailwind / no app imports) ----------

/** Foglamp brand mark — three overlapping circles; lead circle is theme-aware. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="24" fill="var(--fl-brand-lead)" />
      <circle cx="48" cy="24" r="24" fill="#0090FD" />
      <circle cx="72" cy="24" r="24" fill="#FF5513" />
    </svg>
  );
}

// loading-ui "diamond": eight pixels around a diamond, each fading in sequence
// (the comet chase is driven by .fl-px-* delays in styles.ts).
const DIAMOND_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [8, 0], // top
  [12, 4], // top-right
  [16, 8], // right
  [12, 12], // bottom-right
  [8, 16], // bottom
  [4, 12], // bottom-left
  [0, 8], // left
  [4, 4], // top-left
];

function Diamond({ status }: { status: StatusKind }) {
  return (
    <span className={`fl-status ${status}`}>
      <svg
        className="fl-diamond"
        viewBox="0 0 20 20"
        fill="currentColor"
        role="status"
        aria-label="Loading"
      >
        {DIAMOND_PIXELS.map(([x, y], i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 8-element array
          <rect
            key={i}
            className={`fl-px fl-px-${i + 1}`}
            x={x}
            y={y}
            width="3.5"
            height="3.5"
          />
        ))}
      </svg>
    </span>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      className="fl-list-chevron"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function RowCaret({ open }: { open: boolean }) {
  return (
    <svg
      className={`fl-caret ${open ? "open" : ""}`}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Stroke glyphs (status warnings + tool-call types). Sized/colored via the
// container class (.fl-wf-ico / .fl-chip-ico / .fl-err-badge).
const GLYPH = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function WarnIcon() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v3.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}

function GetGlyph() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <path d="M12 4v10" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function CallGlyph() {
  return (
    <svg className="fl-glyph" {...GLYPH}>
      <path d="m8 6-5 6 5 6" />
      <path d="m16 6 5 6-5 6" />
    </svg>
  );
}

// Footer stat glyphs — filled marks with theme-bg cutouts (like the dashboard's
// filled stat-card icons). Colored per stat via the .fl-stat.* tone classes.
function TokensIcon() {
  return (
    <svg
      className="fl-stat-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8.5" cy="12" r="6" />
      <circle cx="15.5" cy="12" r="6" fillOpacity="0.5" />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg
      className="fl-stat-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 6.8v10.4M14.4 9.2c-.5-.7-1.4-1.1-2.5-1.1-1.5 0-2.6.8-2.6 1.9 0 2.6 5.2 1.3 5.2 3.9 0 1.1-1 1.9-2.6 1.9-1.1 0-2-.4-2.5-1.1"
        fill="none"
        stroke="var(--fl-bg)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="fl-stat-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 7.4V12l3 2"
        fill="none"
        stroke="var(--fl-bg)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
