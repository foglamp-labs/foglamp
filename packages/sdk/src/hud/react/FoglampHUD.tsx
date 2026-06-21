"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { formatCost, formatDuration, formatTokens, formatTps } from "./format";
import { rows, type HudStep, type HudToolCall, type HudTrace, type RunStatus } from "./model";
import { HUD_CSS } from "./styles";
import { useHudStream, type ConnStatus } from "./useHudStream";

export interface FoglampHUDProps {
  /** Broker port — must match `foglamp({ hudPort })`. Default 8517. */
  port?: number;
  /** Start expanded (otherwise starts as the closed tab). Default false. */
  defaultOpen?: boolean;
  /** Color theme. "system" follows the host app (its `.dark` class) / OS. Default "system". */
  theme?: "light" | "dark" | "system";
  /** Mask prompt/response/tool payloads on screen — set before recording or screen-sharing. */
  redact?: boolean;
}

type Mode = "closed" | "pill" | "expanded";
type StatusKind = "" | "run" | "err";

const DEFAULT_PORT = 8517;

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
function useResolvedTheme(theme: "light" | "dark" | "system"): "light" | "dark" {
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
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };
    setResolved(compute());
    const mo = new MutationObserver(() => setResolved(compute()));
    mo.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
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
  const { state, conn } = useHudStream(port);
  const [mode, setMode] = useState<Mode>(props.defaultOpen ? "expanded" : "closed");

  // Esc steps back down a level.
  useEffect(() => {
    if (mode === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMode((m) => (m === "expanded" ? "pill" : "closed"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const active = state.traces[0];
  const running = state.traces.some((t) => t.status === "running");
  const status: StatusKind = running ? "run" : active?.status === "error" ? "err" : "";

  // Tick while running so live durations advance.
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  return (
    <Morph mode={mode}>
      {mode === "closed" ? (
        <ClosedTab onOpen={() => setMode("pill")} />
      ) : mode === "pill" ? (
        <Pill
          count={state.traces.length}
          status={status}
          onExpand={() => setMode("expanded")}
          onClose={() => setMode("closed")}
        />
      ) : (
        <Panel
          trace={active}
          conn={conn}
          status={status}
          redact={props.redact ?? false}
          onCollapse={() => setMode("pill")}
        />
      )}
    </Morph>
  );
}

/**
 * Morphs the shell to fit its content as the mode changes — same idea as the
 * dashboard's stepped dialog, done with a plain CSS transition (no animation
 * library, so the bundle stays dependency-free). The single child is measured
 * (offsetWidth/Height) and the shell's width/height eased to it; the first
 * measurement is snapped, later ones tween. Content crossfades per mode.
 */
function Morph({ mode, children }: { mode: Mode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>();
  const ready = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (size) ready.current = true;
  }, [size]);

  return (
    <div
      className="fl-shell"
      data-mode={mode}
      style={size ? { width: size.w, height: size.h, transition: ready.current ? undefined : "none" } : undefined}
    >
      <div ref={ref} className="fl-measure">
        <div key={mode} className="fl-content">
          {children}
        </div>
      </div>
    </div>
  );
}

function ClosedTab({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="fl-tab" onClick={onOpen} aria-label="Open Foglamp HUD">
      <BrandMark className="fl-brand" />
      <ChevronUp />
    </button>
  );
}

function Pill({
  count,
  status,
  onExpand,
  onClose,
}: {
  count: number;
  status: StatusKind;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fl-pill">
      <button type="button" className="fl-pill-main" onClick={onExpand} aria-label="Expand Foglamp HUD">
        <BrandMark className="fl-brand" />
        <span className="fl-pill-name">Foglamp</span>
        {count > 0 && <span className="fl-count">{count}</span>}
      </button>
      <Diamond status={status} />
      <button type="button" className="fl-pill-collapse" onClick={onClose} aria-label="Minimize">
        <ChevronDown />
      </button>
    </div>
  );
}

function Panel({
  trace,
  conn,
  status,
  redact,
  onCollapse,
}: {
  trace: HudTrace | undefined;
  conn: ConnStatus;
  status: StatusKind;
  redact: boolean;
  onCollapse: () => void;
}) {
  return (
    <div className="fl-panel" role="dialog" aria-label="Foglamp HUD">
      <div className="fl-header">
        <BrandMark className="fl-brand" />
        <div className="fl-title">
          <b>{trace ? trace.agentName ?? trace.name : "Foglamp"}</b>
          <span>{trace?.model ?? (conn === "open" ? "waiting for a run…" : "connecting…")}</span>
        </div>
        <Diamond status={status} />
        <button type="button" className="fl-icon-btn" onClick={onCollapse} aria-label="Collapse">
          <ChevronDown />
        </button>
      </div>

      {trace && trace.toolNames.length > 0 && (
        <div className="fl-armory">
          {trace.toolNames.map((name) => {
            const used = trace.tools.some((t) => t.toolName === name);
            return (
              <span key={name} className={used ? "fl-chip used" : "fl-chip"}>
                {name}
              </span>
            );
          })}
        </div>
      )}

      <div className="fl-tree">
        {!trace ? (
          <div className="fl-empty">
            {conn === "open" ? "Run an agent to see it light up." : "Connecting to the local broker…"}
          </div>
        ) : (
          rows(trace).map((row) =>
            row.kind === "step" ? (
              <StepRow key={row.key} step={row.step} />
            ) : (
              <ToolRow key={row.key} tool={row.tool} redact={redact} />
            ),
          )
        )}
      </div>

      {trace && <Footer trace={trace} />}
    </div>
  );
}

function dotClass(status: RunStatus): string {
  return `fl-dot ${status}`;
}

function StepRow({ step }: { step: HudStep }) {
  const meta = [
    step.ttftMs != null ? `ttft ${formatDuration(step.ttftMs)}` : null,
    step.outputTokens > 0 ? `${formatTokens(step.outputTokens)} tok` : null,
    step.outputTps != null ? formatTps(step.outputTps) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`fl-row ${step.status === "error" ? "err" : ""}`}>
      <span className={dotClass(step.status)} />
      <div className="fl-row-main">
        <span className="fl-row-label">
          <b>Step {step.stepNumber + 1}</b>
        </span>
        {meta && <span className="fl-row-sub">{meta}</span>}
      </div>
      <span className="fl-row-meta">{formatDuration(step.durationMs)}</span>
    </div>
  );
}

function ToolRow({ tool, redact }: { tool: HudToolCall; redact: boolean }) {
  const sub =
    tool.status === "error"
      ? redact
        ? "error"
        : tool.errorMessage ?? "error"
      : redact
        ? tool.output
          ? "•••"
          : undefined
        : preview(tool.output);
  return (
    <div className={`fl-row tool ${tool.status === "error" ? "err" : ""}`}>
      <span className={dotClass(tool.status)} />
      <div className="fl-row-main">
        <span className="fl-row-label">
          <b>{tool.toolName}</b>
        </span>
        {sub && <span className="fl-row-sub">{sub}</span>}
      </div>
      <span className="fl-row-meta">{formatDuration(tool.durationMs)}</span>
    </div>
  );
}

function Footer({ trace }: { trace: HudTrace }) {
  const t = trace.totals;
  const outputTokens = t?.outputTokens ?? trace.steps.reduce((sum, s) => sum + s.outputTokens, 0);
  const durationMs = t?.durationMs ?? (trace.endedAt ?? Date.now()) - trace.startedAt;
  const hasError = trace.status === "error";
  return (
    <div className="fl-footer">
      <div className="fl-stat">
        <b>{formatTokens(outputTokens)}</b>
        <span>tokens</span>
      </div>
      <div className="fl-stat">
        <b>{formatCost(t?.costUsd)}</b>
        <span>cost</span>
      </div>
      <div className={`fl-stat ${hasError ? "err" : ""}`}>
        <b>{formatDuration(durationMs)}</b>
        <span>{trace.status === "running" ? "running" : hasError ? "failed" : "done"}</span>
      </div>
    </div>
  );
}

// ---- Vendored assets (Shadow DOM = no Tailwind / no app imports) ----------

/** Foglamp brand mark — three overlapping circles; lead circle is theme-aware. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 48" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="var(--fl-brand-lead)" />
      <circle cx="48" cy="24" r="24" fill="#0090FD" />
      <circle cx="72" cy="24" r="24" fill="#FF5513" />
    </svg>
  );
}

// Eight squares around a diamond path; CSS fades them in sequence (loading-ui).
const DIAMOND_RECTS: ReadonlyArray<readonly [number, number]> = [
  [10.4, 1.4],
  [16.76, 4.04],
  [19.4, 10.4],
  [16.76, 16.76],
  [10.4, 19.4],
  [4.04, 16.76],
  [1.4, 10.4],
  [4.04, 4.04],
];

function Diamond({ status }: { status: StatusKind }) {
  return (
    <span className={`fl-status ${status}`}>
      <svg className="fl-diamond" viewBox="0 0 24 24" aria-hidden="true">
        {DIAMOND_RECTS.map(([x, y], i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 8-element array
          <rect key={i} x={x} y={y} width="3.2" height="3.2" rx="0.6" />
        ))}
      </svg>
    </span>
  );
}

function ChevronUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// First line / first ~48 chars of a serialized payload, for the row subtitle.
function preview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}
