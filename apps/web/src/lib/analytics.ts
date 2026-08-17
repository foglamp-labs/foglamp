import { env } from "@foglamp/env/web";
import posthog from "posthog-js";

type ClientActivationEvent =
  | "instrumentation_prompt_copied"
  | "scan_prompt_copied"
  | "onboarding_prompt_copied"
  | "device_authorization_approved"
  | "trace_viewed"
  // The two moments of the approval loop that happen in the browser. The rest
  // of the funnel is captured server-side (@foglamp/analytics), since it's
  // driven by the user's coding agent.
  | "instrumentation_plan_viewed"
  | "instrumentation_plan_approved";

export function captureActivationEvent(
  event: ClientActivationEvent,
  properties?: Record<string, boolean | number | string | null>,
): void {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NODE_ENV !== "production") {
    return;
  }
  posthog.capture(event, properties);
}
