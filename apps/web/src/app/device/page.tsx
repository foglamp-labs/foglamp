import { headers } from "next/headers";

import { DeviceApprove } from "@/components/device-approve-client";
import LoginForm from "@/components/login-form";
import { authClient } from "@/lib/auth-client";
import { fetchAuthMethods } from "@/lib/auth-methods";

// Verification page for the device-authorization flow (`npx foglamp login`).
// Renders the configured sign-in methods at request time, like /login.
export const dynamic = "force-dynamic";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string }>;
}) {
  const { user_code } = await searchParams;
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: await headers() },
  });

  return (
    <div className="flex min-h-svh items-center justify-center">
      {session?.user ? (
        <DeviceApprove
          initialUserCode={user_code ?? ""}
          userEmail={session.user.email}
        />
      ) : (
        // Sign up / in inline, then return here (now authenticated) to approve.
        // Brand-new users get an org + default project via the signup bootstrap
        // hook, so the CLI's key has somewhere to live. We carry the code back
        // through ?next so the approval step has it after the auth round-trip.
        <LoginForm
          methods={await fetchAuthMethods()}
          next={`/device${
            user_code ? `?user_code=${encodeURIComponent(user_code)}` : ""
          }`}
        />
      )}
    </div>
  );
}
