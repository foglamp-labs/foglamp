// Dev-only simulated network conditions, applied per-procedure by a tRPC
// link (src/utils/trpc.ts) and controlled from the dev toolbar.
// Framework-free on purpose: trpc.ts imports it at module scope, so it must
// not pull in React or any component code. Settings live in localStorage and
// are read at request time, so changes apply to the very next request.

const DELAY_KEY = "foglamp:dev:net-delay";
const FAIL_KEY = "foglamp:dev:net-fail";
const LOADING_KEY = "foglamp:dev:net-loading";

/** Simulated added latency options, in milliseconds. 0 = off. */
export const DEV_NETWORK_DELAYS = [0, 500, 2_000, 5_000] as const;
export type DevNetworkDelay = (typeof DEV_NETWORK_DELAYS)[number];

/** Chance a request fails when the failure toggle is on. */
export const DEV_NETWORK_FAIL_RATE = 0.25;

const listeners = new Set<() => void>();

export function subscribeDevNetwork(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function readDevNetworkDelay(): DevNetworkDelay {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(DELAY_KEY));
  return DEV_NETWORK_DELAYS.includes(value as DevNetworkDelay)
    ? (value as DevNetworkDelay)
    : 0;
}

export function setDevNetworkDelay(delay: DevNetworkDelay) {
  // The default is absence, so a stale key never leaks into a fresh state.
  if (delay === 0) window.localStorage.removeItem(DELAY_KEY);
  else window.localStorage.setItem(DELAY_KEY, String(delay));
  notify();
}

export function readDevNetworkFail(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FAIL_KEY) === "1";
}

export function setDevNetworkFail(fail: boolean) {
  if (fail) window.localStorage.setItem(FAIL_KEY, "1");
  else window.localStorage.removeItem(FAIL_KEY);
  notify();
}

export function readDevForceLoading(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOADING_KEY) === "1";
}

export function setDevForceLoading(forceLoading: boolean) {
  if (forceLoading) window.localStorage.setItem(LOADING_KEY, "1");
  else window.localStorage.removeItem(LOADING_KEY);
  notify();
}

/** Procedures force-loading never hangs. The app shell can't render (and so
 * can't show anyone else's loading state) until the projects list resolves. */
const FORCE_LOADING_EXEMPT_PREFIXES = ["projects."];

/** Applies the active simulated conditions to one outgoing procedure call.
 * Resolves when the real request should proceed; never resolves under
 * force-loading (unless exempt); throws to simulate a network failure. */
export async function applyDevNetworkConditions(path: string): Promise<void> {
  if (
    readDevForceLoading() &&
    !FORCE_LOADING_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    // Never resolves: every screen sits in its pending/skeleton state. The
    // promise is abandoned when the query is cancelled or the page reloads.
    return new Promise<never>(() => {});
  }
  const delay = readDevNetworkDelay();
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (readDevNetworkFail() && Math.random() < DEV_NETWORK_FAIL_RATE) {
    // TypeError mimics a real fetch network failure, so error toasts and
    // retry paths get exercised the same way they would offline.
    throw new TypeError("Simulated network failure (dev toolbar)");
  }
}
