// A one-way line from the benefit sections down the page to the live demo in
// the hero. The demo registers a handler when it mounts; the explore buttons
// and feature chips ask it to show a tab. Nothing is registered before the
// demo's chunk loads, or while its frame is hidden on small screens, so a
// caller learns whether the request was handled and can fall back.

import type { DemoTab } from "@/components/marketing/demo/mock-data";

export type { DemoTab };

type Handler = (tab: DemoTab) => boolean;

let handler: Handler | null = null;

export function registerDemo(fn: Handler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Show `tab` in the hero demo and scroll to it. False when there is no demo
 * to show it in. */
export function showInDemo(tab: DemoTab): boolean {
  return handler?.(tab) ?? false;
}
