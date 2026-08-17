import { env } from "@foglamp/env/web";
import posthog from "posthog-js";

type ClientActivationEvent =
  | "instrumentation_prompt_copied"
  | "scan_prompt_copied"
  | "onboarding_prompt_copied"
  | "device_authorization_approved"
  | "trace_viewed";

export function captureActivationEvent(
  event: ClientActivationEvent,
  properties?: Record<string, boolean | number | string | null>,
): void {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NODE_ENV !== "production") {
    return;
  }
  posthog.capture(event, properties);
}
