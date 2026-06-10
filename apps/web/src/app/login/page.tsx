import { env } from "@foglamp/env/web";

import LoginForm, { type AuthMethods } from "@/components/login-form";

// The login form renders only the sign-in methods the server actually has
// configured, so this page must ask the server at request time.
export const dynamic = "force-dynamic";

// If the server is unreachable during SSR, fall back to the self-host floor
// (password + magic link) rather than rendering an empty login page.
const FALLBACK_METHODS: AuthMethods = {
  emailPassword: true,
  magicLink: true,
  google: false,
};

async function fetchAuthMethods(): Promise<AuthMethods> {
  // SSR may need the in-cluster URL (docker-compose web → server), same as
  // the auth client.
  const base = env.INTERNAL_SERVER_URL || env.NEXT_PUBLIC_SERVER_URL;
  try {
    const res = await fetch(`${base}/api/auth-methods`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_METHODS;
    return (await res.json()) as AuthMethods;
  } catch {
    return FALLBACK_METHODS;
  }
}

export default async function LoginPage() {
  const methods = await fetchAuthMethods();
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoginForm methods={methods} />
    </div>
  );
}
