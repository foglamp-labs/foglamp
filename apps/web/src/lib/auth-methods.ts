import { env } from "@foglamp/env/web";

import type { AuthMethods } from "@/components/login-form";

// Which sign-in methods the server has configured. Pages that render auth UI
// (login, /device) ask the server at request time so they show only what will
// actually work — hence `force-dynamic` on those pages.

// If the server is unreachable during SSR, fall back to the self-host floor
// (password + magic link) rather than rendering an empty form.
const FALLBACK_METHODS: AuthMethods = {
  emailPassword: true,
  magicLink: true,
  google: false,
};

export async function fetchAuthMethods(): Promise<AuthMethods> {
  // SSR may need the in-cluster URL (docker-compose web → server), same as the
  // auth client.
  const base = env.INTERNAL_SERVER_URL || env.NEXT_PUBLIC_SERVER_URL;
  try {
    const res = await fetch(`${base}/api/auth-methods`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_METHODS;
    return (await res.json()) as AuthMethods;
  } catch {
    return FALLBACK_METHODS;
  }
}
