import { headers } from "next/headers";

import LoginForm from "@/components/login-form";
import { authClient } from "@/lib/auth-client";
import { fetchAuthMethods } from "@/lib/auth-methods";

import { SetupClient } from "./setup-client";

// The instrumentation plan review page. Deliberately outside the (app) shell,
// following the /device precedent: the coding agent opens this URL directly, so
// a signed-out visitor gets sign-in *inline* rather than a redirect that would
// lose the plan id. The renderer also wants the whole viewport — FlowMap is
// absolute inset-0 — which a sidebar layout can't give it.
export const dynamic = "force-dynamic";

export default async function SetupPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        {/* Brand-new users sign up here and come straight back — the agent is
            still holding on the approval poll while they do. */}
        <LoginForm
          methods={await fetchAuthMethods()}
          next={`/setup/${encodeURIComponent(planId)}`}
        />
      </div>
    );
  }

  return <SetupClient planId={planId} />;
}
