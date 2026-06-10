import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Optional in-cluster URL for SSR requests to apps/server (e.g. the
    // docker-compose web tier reaching the `server` service over the internal
    // network). Unset ⇒ SSR uses NEXT_PUBLIC_SERVER_URL.
    INTERNAL_SERVER_URL: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url(),
    // PostHog product analytics. Key absent ⇒ analytics disabled (no-op).
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
  },
  runtimeEnv: {
    INTERNAL_SERVER_URL: process.env.INTERNAL_SERVER_URL,
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  emptyStringAsUndefined: true,
});
