export const HUD_CSS = /* css */ `
:host {
  /* light (default) */
  --fl-bg: oklch(1 0 0);
  --fl-fg: oklch(0.205 0 0);
  --fl-muted: oklch(0.556 0 0);
  --fl-subtle: oklch(0.97 0 0);
  --fl-border: oklch(0.922 0 0);
  --fl-sep: oklch(0.955 0 0); /* softer than border — internal separators */
  --fl-ok: oklch(0.7 0.15 162);
  --fl-ok-bg: oklch(0.95 0.05 162);
  --fl-err: oklch(0.64 0.21 16);
  --fl-err-bg: oklch(0.95 0.04 16);
  --fl-warn: oklch(0.72 0.15 70);
  --fl-warn-bg: oklch(0.95 0.05 85);
  --fl-loading: #0090fd; /* blue — live/running indicator (the loading diamond) */
  --fl-brand-lead: #1e1e1e;
  --fl-ring: 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 4px 0 rgba(0,0,0,0.04);
  --fl-shadow: 0 12px 30px -10px rgba(0,0,0,0.42), 0 2px 6px -2px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.08);
  --fl-shadow-hover: 0 18px 44px -12px rgba(0,0,0,0.48), 0 2px 8px -2px rgba(0,0,0,0.24), 0 0 0 1px rgba(0,0,0,0.10);

  all: initial;
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  z-index: 2147483000;
  color-scheme: light;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fl-fg);
  -webkit-font-smoothing: antialiased;
}
:host([data-theme="dark"]) {
  --fl-bg: oklch(0.205 0 0);
  --fl-fg: oklch(0.97 0 0);
  --fl-muted: oklch(0.62 0 0);
  --fl-subtle: oklch(0.27 0 0);
  --fl-border: oklch(0.31 0 0);
  --fl-sep: oklch(0.26 0 0); /* softer than border — internal separators */
  --fl-ok: oklch(0.72 0.15 162);
  --fl-ok-bg: oklch(0.30 0.05 162);
  --fl-err: oklch(0.68 0.2 16);
  --fl-err-bg: oklch(0.30 0.06 16);
  --fl-warn: oklch(0.8 0.13 78);
  --fl-warn-bg: oklch(0.33 0.06 75);
  --fl-loading: #38a8ff; /* blue — live/running indicator (brighter for dark) */
  --fl-brand-lead: #ededed;
  --fl-ring: 0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px -1px rgba(0,0,0,0.4);
  --fl-shadow: 0 12px 30px -10px rgba(0,0,0,0.78), 0 2px 6px -2px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10);
  --fl-shadow-hover: 0 18px 44px -12px rgba(0,0,0,0.82), 0 2px 8px -2px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14);
  color-scheme: dark;
}

* { box-sizing: border-box; }
button { font: inherit; border: none; background: none; cursor: pointer; color: inherit; }

/* The morphing shell. A vendored rAF spring animates width/height (inline style);
   radius + lift transition by mode. overflow:hidden clips content during the morph. */
.fl-shell {
  position: relative;
  overflow: hidden;
  background: var(--fl-bg);
  box-shadow: var(--fl-shadow);
  /* width/height are spring-animated via inline style; only radius + lift + shadow here. */
  transition:
    box-shadow 0.22s ease,
    border-radius 0.3s cubic-bezier(0.32,0.72,0,1),
    margin-bottom 0.3s cubic-bezier(0.32,0.72,0,1);
}
/* 19px = half the 38px pill height → a perfect stadium, but a concrete value so
   it morphs cleanly to the panel's 18px instead of clamping-then-snapping the
   way 9999px does as the box grows. */
.fl-shell[data-mode="pill"]     { border-radius: 19px; margin-bottom: 18px; }
.fl-shell[data-mode="expanded"] { border-radius: 18px; margin-bottom: 18px; }
/* Pill hover — a stronger (neutral) shadow + a soft fill, to signal it's clickable. */
.fl-shell[data-mode="pill"]:hover {
  box-shadow: var(--fl-shadow-hover);
}

/* The entering view is measured directly; its natural size drives the shell.
   Keyed remount on view change → this fade-in replays (the cross-fade). */
.fl-mode { width: max-content; animation: fl-fade-in 0.16s cubic-bezier(0.32,0.72,0,1); }
@keyframes fl-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* ---- Pill (the whole row is the expand target) ---- */
.fl-pill { display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 14px; cursor: pointer; transition: background-color 0.2s ease; }
.fl-shell[data-mode="pill"]:hover .fl-pill { background-color: var(--fl-subtle); }
.fl-brand { width: 24px; height: 12px; flex: none; display: block; }
.fl-count { font-size: 14px; font-weight: 500; line-height: 1; color: var(--fl-fg); font-variant-numeric: tabular-nums; }
/* A touch more breathing room before the status diamond. */
.fl-pill .fl-status { margin-left: 3px; }

/* ---- Diamond status (loading-ui): eight pixels, comet-chase via spin-pixel ---- */
.fl-status { flex: none; display: inline-flex; color: var(--fl-muted); }
.fl-status.run { color: var(--fl-loading); }
.fl-status.err { color: var(--fl-err); }
.fl-diamond { width: 12px; height: 12px; display: block; }
.fl-diamond rect { fill: currentColor; }
.fl-px { opacity: 1; } /* idle / error: a solid diamond */
.fl-status.run .fl-px { opacity: 0; animation: fl-spin-pixel 0.8s ease-in-out infinite; }
.fl-status.run .fl-px-1 { animation-delay: 0s; }
.fl-status.run .fl-px-2 { animation-delay: 0.1s; }
.fl-status.run .fl-px-3 { animation-delay: 0.2s; }
.fl-status.run .fl-px-4 { animation-delay: 0.3s; }
.fl-status.run .fl-px-5 { animation-delay: 0.4s; }
.fl-status.run .fl-px-6 { animation-delay: 0.5s; }
.fl-status.run .fl-px-7 { animation-delay: 0.6s; }
.fl-status.run .fl-px-8 { animation-delay: 0.7s; }
@keyframes fl-spin-pixel { 0% { opacity: 0; } 1% { opacity: 1; } 100% { opacity: 0; } }

/* ---- Expanded panel ---- */
.fl-panel { width: 440px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; }
/* The single-run detail view is roomier (the waterfall wants horizontal space). */
.fl-panel-detail { width: 580px; }
.fl-header { display: flex; align-items: center; gap: 7px; padding: 12px 10px 11px 10px; border-bottom: 1px solid var(--fl-sep); }
/* List view has no back button, so indent the title to line up nicely; and it
   flows straight into the timeline (no divider above the chart). */
.fl-header-list { padding-left: 18px; border-bottom: none; }
/* Extra gap after the status diamond before the trash/collapse buttons. */
.fl-header-list .fl-status { margin-right: 7px; }
.fl-title { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.fl-title b { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-title span { color: var(--fl-muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Model icon + name (detail header). */
.fl-model { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; }
.fl-model-icon { flex: none; display: block; border-radius: 3px; } /* size via the SVG width/height attr */
.fl-icon-btn { width: 28px; height: 28px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--fl-muted); border-radius: 8px; transition: background 0.12s ease, color 0.12s ease; }
.fl-icon-btn:hover { background: var(--fl-subtle); color: var(--fl-fg); }
.fl-icon-btn svg { width: 16px; height: 16px; }

.fl-armory { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 12px; border-bottom: 1px solid var(--fl-sep); }
.fl-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px 2px 7px; border-radius: 999px; font-size: 11px; background: var(--fl-subtle); color: var(--fl-muted); border: 1px solid var(--fl-border); transition: all 0.15s ease; }
.fl-chip.used { background: var(--fl-ok-bg); color: var(--fl-ok); border-color: transparent; }
.fl-chip-ico { display: inline-flex; flex: none; opacity: 0.85; }
.fl-chip-ico .fl-glyph { width: 12px; height: 12px; }

/* ---- Live timeline: fixed 1-min window, scrolls horizontally; runs as pills,
       concurrent ones collapsed into cluster markers ---- */
.fl-timeline { padding: 11px 0 9px; border-bottom: 1px solid var(--fl-sep); }
/* Scrollable but no visible scrollbar. */
.fl-tl-scroll { overflow-x: auto; overflow-y: hidden; padding: 0 14px; scrollbar-width: none; -ms-overflow-style: none; }
.fl-tl-scroll::-webkit-scrollbar { display: none; }
.fl-tl-inner { position: relative; min-width: 100%; }
.fl-tl-track { position: relative; height: 24px; }
.fl-tl-axis { position: absolute; left: 0; right: 0; top: 50%; height: 1px; transform: translateY(-50%); background: var(--fl-border); }
/* Vertical 15s grid + the time captions below (rightmost = now). */
.fl-tl-grid { position: absolute; top: 0; bottom: 0; width: 1px; transform: translateX(-0.5px); background: var(--fl-sep); }
.fl-tl-grid.now { background: var(--fl-border); }
.fl-tl-axislabels { position: relative; height: 13px; margin-top: 6px; }
.fl-tl-tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 9.5px; line-height: 1; color: var(--fl-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.fl-tl-tick.now { color: var(--fl-fg); font-weight: 500; }
.fl-tl-bar {
  position: absolute; top: 50%; transform: translateY(-50%);
  height: 18px; min-width: 18px; border-radius: 9999px;
  display: inline-flex; align-items: center; padding: 0 2px;
  border: none; cursor: pointer;
  box-shadow: 0 0 0 1.5px var(--fl-bg); /* bg ring separates overlapping pills */
  transition: left 0.25s linear, width 0.25s linear;
}
.fl-tl-bar.run { animation: fl-pulse 1.6s ease-in-out infinite; }
.fl-tl-ico { width: 14px; height: 14px; flex: none; display: block; }
.fl-tl-ico path { fill: var(--fl-bg); } /* glyph punched out of the agent color */
/* Cluster marker — concurrent runs: stacked agent dots + a count. */
.fl-tl-cluster {
  position: absolute; top: 50%; transform: translateY(-50%);
  display: flex; align-items: center; justify-content: flex-start; gap: 4px;
  height: 22px; min-width: 54px; padding: 0 7px 0 3px; border-radius: 9999px;
  background: var(--fl-bg); box-shadow: 0 0 0 1.5px var(--fl-border); cursor: pointer;
  transition: left 0.25s linear, width 0.25s linear;
}
.fl-tl-cdots { display: inline-flex; }
.fl-tl-cdot { width: 16px; height: 16px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1.5px var(--fl-bg); }
.fl-tl-cdot:not(:first-child) { margin-left: -6px; }
.fl-tl-cdot svg { width: 11px; height: 11px; display: block; }
.fl-tl-cdot svg path { fill: var(--fl-bg); }
.fl-tl-cn { font-size: 10.5px; font-weight: 600; color: var(--fl-muted); font-variant-numeric: tabular-nums; }

/* Agent identity badge — colored circle + agent glyph (matches the timeline).
   Sits inline at the start of the name line (above the model icon). */
.fl-agent-badge { width: 12px; height: 12px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.fl-agent-badge svg { width: 8px; height: 8px; display: block; }
.fl-agent-badge svg path { fill: var(--fl-bg); }
/* Detail header: badge + name share the first line (the agent name is the
   primary heading), model below. */
.fl-title-top { display: flex; align-items: center; gap: 7px; min-width: 0; }
/* color: the .fl-title span rule mutes the wrapping span, so restore fg on the name. */
.fl-title-top b { min-width: 0; font-size: 15.5px; font-weight: 700; letter-spacing: -0.01em; color: var(--fl-fg); }

/* ---- Trace list (the session's runs; tap one for its detail) ---- */
/* ~7 rows tall, then scroll. */
.fl-list { max-height: 388px; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.fl-list-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 8px 9px 11px; border-radius: 11px; text-align: left;
  transition: background 0.12s ease;
}
.fl-list-row:hover { background: var(--fl-subtle); }
.fl-list-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fl-list-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.fl-list-agent { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Red warning badge after the agent name when the run had errors. */
.fl-err-badge { display: inline-flex; align-items: center; gap: 2px; flex: none; color: var(--fl-err); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fl-err-badge .fl-glyph { width: 13px; height: 13px; }
/* Running indicator in a list row — the blue loading diamond, in the err slot. */
.fl-list-loading { flex: none; display: inline-flex; align-items: center; }
.fl-list-sub { display: inline-flex; align-items: center; gap: 5px; color: var(--fl-muted); font-size: 11.5px; min-width: 0; overflow: hidden; }
.fl-list-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.fl-list-tools { flex: none; white-space: nowrap; }
.fl-list-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex: none; color: var(--fl-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.fl-list-chevron { width: 15px; height: 15px; flex: none; display: block; color: var(--fl-muted); opacity: 0.5; }

.fl-tree { max-height: 440px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 1px; }
.fl-panel-detail .fl-tree { max-height: 520px; }
/* Streaming rows fade+rise in as they arrive (plays once on mount per keyed row). */
.fl-row-item { display: flex; flex-direction: column; animation: fl-row-in 0.26s cubic-bezier(0.22,1,0.36,1); }
@keyframes fl-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
/* Expanding detail: grid-rows 0fr→1fr is the CSS-only way to animate height:auto. */
.fl-row-detail { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.18s ease; }
.fl-row-detail.open { grid-template-rows: 1fr; opacity: 1; }
.fl-row-detail-inner { overflow: hidden; min-height: 0; }
.fl-row {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 7px 9px; border-radius: 9px; cursor: pointer; transition: background 0.12s ease;
}
.fl-row:hover, .fl-row.open { background: var(--fl-subtle); }
.fl-row.err { background: var(--fl-err-bg); animation: fl-flash 0.6s ease 1; }
.fl-glyph { width: 14px; height: 14px; display: block; flex: none; }

/* ---- Waterfall row: [icon + label] | time bar (shared axis) | duration ---- */
.fl-wf-label { display: inline-flex; align-items: center; gap: 6px; width: 138px; flex: none; min-width: 0; }
.fl-wf-label.tool { padding-left: 15px; }
.fl-wf-label b { flex: 0 1 auto; min-width: 0; font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Dotted leader from the name to the track. Same absolute mechanism as the
   track's line (both at the row's vertical center) so the dots line up exactly. */
.fl-wf-lead { flex: 1 1 0; min-width: 6px; align-self: stretch; position: relative; }
.fl-wf-lead::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); border-top: 1px dotted var(--fl-border); }
.fl-wf-ico { flex: none; display: inline-flex; color: var(--fl-muted); }
.fl-wf-ico.err { color: var(--fl-err); }
.fl-wf-ico .fl-glyph { width: 13px; height: 13px; }
.fl-wf-track { position: relative; flex: 1; height: 16px; min-width: 0; }
/* Dotted leader connecting the label to the duration; the bar paints over it. */
.fl-wf-track::before { content: ""; position: absolute; left: -8px; right: 0; top: 50%; transform: translateY(-50%); border-top: 1px dotted var(--fl-border); }
/* Errored span: tint both dotted segments red to match the bar + row. */
.fl-row.err .fl-wf-lead::after,
.fl-row.err .fl-wf-track::before { border-top-color: color-mix(in oklab, var(--fl-err) 55%, transparent); }
.fl-wf-bar { position: absolute; top: 50%; transform: translateY(-50%); height: 8px; min-width: 4px; border-radius: 999px; box-shadow: 0 0 0 2px var(--fl-bg); transition: left 0.2s linear, width 0.2s linear; }
.fl-wf-bar.step { background: #6366f1; }
.fl-wf-bar.tool { background: #14b8a6; }
.fl-wf-bar.err { background: var(--fl-err); }
.fl-wf-bar.run { animation: fl-pulse 1.4s ease-in-out infinite; }
.fl-wf-dur { flex: none; width: 48px; text-align: right; color: var(--fl-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }

.fl-caret { flex: none; margin-left: 1px; color: var(--fl-muted); opacity: 0.55; transition: transform 0.18s ease; }
.fl-caret.open { transform: rotate(180deg); }
/* Expanded row detail */
.fl-kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; margin: 4px 0 9px; padding-left: 30px; font-size: 11.5px; }
.fl-kv > div { display: contents; }
.fl-kv dt { color: var(--fl-muted); }
.fl-kv dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.fl-io { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 9px; padding: 0 10px 0 30px; }
.fl-io-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--fl-muted); margin-bottom: 4px; }
.fl-io-pre { margin: 0; max-height: 150px; overflow: auto; background: var(--fl-subtle); border-radius: 8px; padding: 7px 9px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--fl-fg); }
.fl-io-block.err .fl-io-pre { color: var(--fl-err); background: var(--fl-err-bg); }

.fl-footer { display: flex; gap: 4px; padding: 12px 22px; border-top: 1px solid var(--fl-sep); }
.fl-stat { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.fl-stat b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fl-stat span { display: flex; align-items: center; gap: 4px; color: var(--fl-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
.fl-stat-icon { width: 12px; height: 12px; flex: none; display: block; }
.fl-stat.tokens .fl-stat-icon { color: #3b82f6; }
.fl-stat.cost .fl-stat-icon { color: #eab308; }
.fl-stat.dur .fl-stat-icon { color: #8b5cf6; }
.fl-stat.err .fl-stat-icon { color: var(--fl-err); }
.fl-stat.err b { color: var(--fl-err); }
/* Empty state — a radar "listening" ping. */
.fl-empty { padding: 34px 16px 36px; display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--fl-muted); font-size: 12px; }
.fl-empty p { margin: 0; }
.fl-listening { position: relative; width: 9px; height: 9px; }
.fl-listening::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--fl-ok); }
.fl-listening span { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--fl-ok); animation: fl-ping 1.9s cubic-bezier(0,0,0.2,1) infinite; }
.fl-listening span:nth-child(2) { animation-delay: 0.95s; }

/* ---- Hide-for-session confirmation — a red alert bar above the window ---- */
.fl-hide-alert {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 9px 12px;
  border-radius: 14px;
  background: var(--fl-err-bg); color: var(--fl-err);
  border: 2px solid var(--fl-err);
  box-shadow: var(--fl-shadow);
  font-size: 12.5px; font-weight: 500;
  animation:
    fl-alert-in 0.28s cubic-bezier(0.22,1,0.36,1),
    fl-alert-pulse 1.8s ease-in-out 0.3s infinite;
}
.fl-hide-alert .fl-glyph { width: 15px; height: 15px; flex: none; }
.fl-hide-alert-text { flex: 1; min-width: 0; white-space: nowrap; }
.fl-hide-btn { flex: none; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--fl-err); transition: background 0.12s ease; }
.fl-hide-btn:hover { background: color-mix(in oklab, var(--fl-err) 14%, transparent); }
.fl-hide-btn.confirm { background: var(--fl-err); color: var(--fl-bg); }
.fl-hide-btn.confirm:hover { background: color-mix(in oklab, var(--fl-err) 85%, black); }
/* Exit: the entrance wipe in reverse. Overrides the pulse (single animation
   list), and \`forwards\` holds the faded-out end state until React unmounts it
   on animationend. */
.fl-hide-alert.closing {
  animation: fl-alert-out 0.28s cubic-bezier(0.22,1,0.36,1) forwards;
  pointer-events: none;
}
@keyframes fl-alert-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes fl-alert-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px) scale(0.97); } }
@keyframes fl-alert-pulse { 0%, 100% { border-color: var(--fl-err); } 50% { border-color: color-mix(in oklab, var(--fl-err) 45%, transparent); } }

@keyframes fl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes fl-flash { 0% { background: var(--fl-err-bg); } 35% { background: var(--fl-err); } 100% { background: var(--fl-err-bg); } }
@keyframes fl-ping { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(3.6); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .fl-status.run .fl-px, .fl-tl-bar.run, .fl-wf-bar.run, .fl-listening span { animation: none; }
  .fl-status.run .fl-px { opacity: 1; }
  .fl-shell { transition: none; }
  .fl-mode, .fl-row-item, .fl-hide-alert { animation: none; }
  /* No exit animation → no animationend to unmount on; just vanish. */
  .fl-hide-alert.closing { display: none; }
  .fl-row-detail { transition: none; }
}
`;
