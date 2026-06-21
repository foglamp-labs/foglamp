// The HUD's stylesheet, injected into a Shadow DOM root so it can't collide with
// (or be restyled by) the host app. Tokens are vendored from the Foglamp design
// system (packages/ui/src/styles/globals.css): neutral oklch surfaces, soft
// shadow rings, squircle radii, emerald/rose status, tabular figures. No neon.
//
// Three states (closed tab → pill → expanded panel) are anchored bottom-center;
// the shell morphs its size between them (motion drives width/height, these
// rules handle radius, lift, and content). Theme follows the host app.

export const HUD_CSS = /* css */ `
:host {
  /* light (default) */
  --fl-bg: oklch(1 0 0);
  --fl-fg: oklch(0.205 0 0);
  --fl-muted: oklch(0.556 0 0);
  --fl-subtle: oklch(0.97 0 0);
  --fl-border: oklch(0.922 0 0);
  --fl-ok: oklch(0.7 0.15 162);
  --fl-ok-bg: oklch(0.95 0.05 162);
  --fl-err: oklch(0.64 0.21 16);
  --fl-err-bg: oklch(0.95 0.04 16);
  --fl-brand-lead: #1e1e1e;
  --fl-ring: 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 4px 0 rgba(0,0,0,0.04);
  --fl-shadow: 0 12px 32px -12px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06);

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
  --fl-ok: oklch(0.72 0.15 162);
  --fl-ok-bg: oklch(0.30 0.05 162);
  --fl-err: oklch(0.68 0.2 16);
  --fl-err-bg: oklch(0.30 0.06 16);
  --fl-brand-lead: #ededed;
  --fl-ring: 0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px -1px rgba(0,0,0,0.4);
  --fl-shadow: 0 12px 32px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
  color-scheme: dark;
}

* { box-sizing: border-box; }
button { font: inherit; border: none; background: none; cursor: pointer; color: inherit; }

/* The morphing shell. motion animates width/height; radius + lift transition by
   mode. overflow:hidden clips content during the size morph. */
.fl-shell {
  position: relative;
  overflow: hidden;
  background: var(--fl-bg);
  box-shadow: var(--fl-shadow);
  transition: border-radius 0.28s cubic-bezier(0.32,0.72,0,1), margin-bottom 0.28s cubic-bezier(0.32,0.72,0,1);
}
.fl-shell[data-mode="closed"]   { border-radius: 11px 11px 0 0; margin-bottom: 0; }
.fl-shell[data-mode="pill"]     { border-radius: 9999px; margin-bottom: 18px; }
.fl-shell[data-mode="expanded"] { border-radius: 18px; margin-bottom: 18px; }

/* The single measured child — its natural size is what the shell animates to. */
.fl-measure { width: max-content; }

/* ---- Closed: a small tab emerging from the bottom edge ---- */
.fl-tab {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  width: 78px; height: 22px; color: var(--fl-muted);
}
.fl-tab:hover { color: var(--fl-fg); }
.fl-tab svg { width: 13px; height: 13px; }

/* ---- Pill ---- */
.fl-pill { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 13px; }
.fl-pill-main { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.fl-brand { width: 18px; height: 9px; flex: none; display: block; }
.fl-pill-name { font-weight: 600; font-size: 13px; white-space: nowrap; }
.fl-count { font-size: 12px; color: var(--fl-muted); font-variant-numeric: tabular-nums; padding-left: 1px; }
.fl-pill-collapse {
  width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
  color: var(--fl-muted); opacity: 0; transition: opacity 0.15s ease; border-radius: 5px;
}
.fl-pill:hover .fl-pill-collapse { opacity: 1; }
.fl-pill-collapse:hover { color: var(--fl-fg); background: var(--fl-subtle); }
.fl-pill-collapse svg { width: 13px; height: 13px; }

/* ---- Diamond status loader (8 squares fading in sequence; uses currentColor) ---- */
.fl-status { flex: none; display: inline-flex; color: var(--fl-muted); }
.fl-status.run { color: var(--fl-ok); }
.fl-status.err { color: var(--fl-err); }
.fl-diamond { width: 15px; height: 15px; display: block; }
.fl-diamond rect { fill: currentColor; opacity: 1; }
.fl-status.run .fl-diamond rect { animation: fl-diamond 1.1s linear infinite; }
.fl-diamond rect:nth-child(1) { animation-delay: 0s; }
.fl-diamond rect:nth-child(2) { animation-delay: -0.1375s; }
.fl-diamond rect:nth-child(3) { animation-delay: -0.275s; }
.fl-diamond rect:nth-child(4) { animation-delay: -0.4125s; }
.fl-diamond rect:nth-child(5) { animation-delay: -0.55s; }
.fl-diamond rect:nth-child(6) { animation-delay: -0.6875s; }
.fl-diamond rect:nth-child(7) { animation-delay: -0.825s; }
.fl-diamond rect:nth-child(8) { animation-delay: -0.9625s; }
@keyframes fl-diamond { 0%, 100% { opacity: 0.18; } 30% { opacity: 1; } }

/* ---- Expanded panel ---- */
.fl-panel { width: 384px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; }
.fl-header { display: flex; align-items: center; gap: 8px; padding: 12px 10px 10px 14px; border-bottom: 1px solid var(--fl-border); }
.fl-header .fl-brand { width: 20px; height: 10px; }
.fl-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.fl-title b { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-title span { color: var(--fl-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-icon-btn { width: 26px; height: 26px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--fl-muted); border-radius: 7px; }
.fl-icon-btn:hover { background: var(--fl-subtle); color: var(--fl-fg); }
.fl-icon-btn svg { width: 15px; height: 15px; }

.fl-armory { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 12px; border-bottom: 1px solid var(--fl-border); }
.fl-chip { padding: 2px 8px; border-radius: 999px; font-size: 11px; background: var(--fl-subtle); color: var(--fl-muted); border: 1px solid var(--fl-border); transition: all 0.15s ease; }
.fl-chip.used { background: var(--fl-ok-bg); color: var(--fl-ok); border-color: transparent; }

.fl-tree { max-height: 360px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.fl-row { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 9px; animation: fl-fade 0.22s ease both; }
.fl-row.tool { margin-left: 16px; }
.fl-row.err { background: var(--fl-err-bg); animation: fl-fade 0.22s ease both, fl-flash 0.6s ease 1; }
.fl-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--fl-muted); }
.fl-dot.run { background: var(--fl-ok); animation: fl-pulse 1.1s ease-in-out infinite; }
.fl-dot.ok { background: var(--fl-ok); }
.fl-dot.err { background: var(--fl-err); }
.fl-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fl-row-label { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-row-label b { font-weight: 600; }
.fl-row-sub { color: var(--fl-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-row-meta { color: var(--fl-muted); font-size: 11px; font-variant-numeric: tabular-nums; flex: none; text-align: right; }

.fl-footer { display: flex; gap: 4px; padding: 9px 12px; border-top: 1px solid var(--fl-border); }
.fl-stat { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.fl-stat b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fl-stat span { color: var(--fl-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
.fl-stat.err b { color: var(--fl-err); }
.fl-empty { padding: 28px 16px; text-align: center; color: var(--fl-muted); font-size: 12px; }

@keyframes fl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes fl-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes fl-flash { 0% { background: var(--fl-err-bg); } 35% { background: var(--fl-err); } 100% { background: var(--fl-err-bg); } }

@media (prefers-reduced-motion: reduce) {
  .fl-dot.run, .fl-status.run .fl-diamond rect { animation: none; }
  .fl-row, .fl-shell { transition: none; }
}
`;
