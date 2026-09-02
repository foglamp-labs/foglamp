import { closeAllBrokers, getBroker } from "./broker";
import type { HudEvent } from "./events";
import { priceTraceUsd, warmPricing } from "./pricing";

export { closeAllBrokers };

/** Start the broker now (before any trace) so the HUD can connect eagerly. */
export function ensureBroker(port: number, onError: (error: unknown) => void): void {
  getBroker(port, onError);
}

/**
 * Enrich and broadcast one HUD event. Pre-warms pricing as soon as a trace
 * starts; fills in `costUsd` on `trace.end` when the pricing table is ready
 * (otherwise leaves it null → the HUD shows "—").
 */
export function relay(port: number, onError: (error: unknown) => void, event: HudEvent): void {
  if (event.type === "trace.start") {
    warmPricing();
  } else if (event.type === "trace.end" && event.totals.costUsd === null) {
    const usd = priceTraceUsd(event.trace.spans);
    if (usd !== null) event.totals.costUsd = usd;
  }
  getBroker(port, onError).emit(event);
}
