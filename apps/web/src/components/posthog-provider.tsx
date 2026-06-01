"use client";

import { env } from "@foglamp/env/web";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

// Product analytics. A no-op when NEXT_PUBLIC_POSTHOG_KEY is unset (local dev /
// self-host without analytics), so nothing loads or phones home. App Router
// SPA pageviews + pageleave are captured automatically via posthog's `defaults`.

const POSTHOG_KEY = env.NEXT_PUBLIC_POSTHOG_KEY;

// Module-level guard so React Strict Mode's double-invoked effect inits once.
let started = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) return <>{children}</>;
  return <PostHogInner>{children}</PostHogInner>;
}

function PostHogInner({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  const name = session?.user?.name;

  useEffect(() => {
    if (started) return;
    started = true;
    posthog.init(POSTHOG_KEY!, {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
      // SPA pageview + pageleave autocapture for the App Router (2025-05-24 preset).
      defaults: "2025-05-24",
      // Authed dashboard — don't create anonymous profiles for unidentified hits.
      person_profiles: "identified_only",
    });
  }, []);

  // Tie events to the logged-in user; clear identity on logout.
  useEffect(() => {
    if (userId) {
      posthog.identify(userId, { email, name });
    } else {
      posthog.reset();
    }
  }, [userId, email, name]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
