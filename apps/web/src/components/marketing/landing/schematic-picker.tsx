"use client";

import { useSyncExternalStore } from "react";

import { SCHEMATICS, type Section } from "./schematics";

// A development aid for choosing between the candidate drawings. The
// selection lives in a tiny store backed by localStorage, so it survives
// reloads while comparing. The picker only mounts in development; production
// always shows DEFAULTS.

const DEFAULTS: Record<Section, string> = {
  costs: "treemap",
  traces: "rows",
  quality: "scatter",
};

const KEY = "landing-schematics";
const SECTIONS = Object.keys(SCHEMATICS) as Section[];

let selection: Record<Section, string> = DEFAULTS;
const listeners = new Set<() => void>();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) selection = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Ignore a bad or unavailable store; keep the defaults.
  }
}

function subscribe(fn: () => void) {
  if (listeners.size === 0) load();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function select(section: Section, id: string) {
  selection = { ...selection, [section]: id };
  try {
    localStorage.setItem(KEY, JSON.stringify(selection));
  } catch {
    // Same as above.
  }
  for (const fn of listeners) fn();
}

function useSelection() {
  return useSyncExternalStore(
    subscribe,
    () => selection,
    () => DEFAULTS
  );
}

// The figure for one benefit section, whichever variant is selected.
export function Figure({ section }: { section: Section }) {
  const current = useSelection();
  const variants = SCHEMATICS[section];
  const variant = variants.find((v) => v.id === current[section]) ?? variants[0];
  const Component = variant.component;
  return <Component />;
}

// A floating pill at the bottom center: one segmented control per section.
export function SchematicControls() {
  const current = useSelection();
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        {SECTIONS.map((section) => (
          <fieldset key={section} className="flex items-center gap-1.5">
            <legend className="sr-only">{section} illustration</legend>
            <span className="pl-1 font-mono text-[11px] text-muted-foreground">
              {section}
            </span>
            {SCHEMATICS[section].map((v) => {
              const on = current[section] === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => select(section, v.id)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                    on
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
