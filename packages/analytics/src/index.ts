import { env } from "@foglamp/env/server";

export type ActivationEvent =
  | "user_signed_up"
  | "api_key_provisioned"
  | "project_sent_spans"
  | "subscription_started"
  // The onboarding approval loop. Fired server-side because most of these
  // transitions are driven by the user's coding agent, not their browser.
  // Each one fires at most once per plan: they hang off a conditional UPDATE
  // that flips a null timestamp, so reloads and repeated polls can't duplicate.
  | "instrumentation_plan_created"
  | "instrumentation_plan_approved"
  | "instrumentation_agent_resumed"
  | "instrumentation_changes_applied"
  | "instrumentation_waiting_for_trace"
  | "instrumentation_verified"
  | "instrumentation_plan_expired"
  | "instrumentation_plan_failed";

type CaptureInput = {
  event: ActivationEvent;
  distinctId: string;
  properties?: Record<string, boolean | number | string | null>;
};

/** Best-effort server capture. Analytics must never break a product request. */
export async function captureActivationEvent({
  event,
  distinctId,
  properties = {},
}: CaptureInput): Promise<void> {
  if (!env.POSTHOG_KEY || env.NODE_ENV !== "production") return;

  try {
    const response = await fetch(
      `${env.POSTHOG_HOST.replace(/\/$/, "")}/i/v0/e/`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: env.POSTHOG_KEY,
          event,
          properties: {
            distinct_id: distinctId,
            ...properties,
          },
        }),
      },
    );
    if (!response.ok) {
      console.warn(`[analytics] PostHog capture failed: ${response.status}`);
    }
  } catch (error) {
    console.warn("[analytics] PostHog capture failed", error);
  }
}
