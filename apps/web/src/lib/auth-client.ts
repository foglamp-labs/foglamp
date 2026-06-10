import { stripeClient } from "@better-auth/stripe/client";
import { env } from "@foglamp/env/web";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient } from "better-auth/client/plugins";

// In the browser, always use the public server URL. During SSR (e.g. the
// (app)/layout session gate) the web container can't reach the public host, so
// honor INTERNAL_SERVER_URL when set — that's how the docker-compose web tier
// talks to the `server` service over the internal network. Falls back to the
// public URL for non-containerized SSR.
const baseURL =
  typeof window === "undefined"
    ? env.INTERNAL_SERVER_URL || env.NEXT_PUBLIC_SERVER_URL
    : env.NEXT_PUBLIC_SERVER_URL;

export const authClient = createAuthClient({
  baseURL,
  // magicLinkClient just exposes signIn.magicLink; harmless if the server has
  // email disabled (the call simply won't be reachable). organizationClient
  // adds org/member/invitation methods used by Settings.
  // stripeClient adds subscription methods (upgrade/list/billingPortal) used by
  // the Billing tab; harmless when the server has billing disabled.
  plugins: [
    magicLinkClient(),
    organizationClient(),
    stripeClient({ subscription: true }),
  ],
});
