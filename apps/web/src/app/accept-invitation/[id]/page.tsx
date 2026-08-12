import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import { AcceptInvitationClient } from "./accept-invitation-client";

// Lives outside the (app) group on purpose: the invite email links here before
// the user has a session (or any org), so it must not sit behind the app
// shell's session gate or the project gate. It runs its own session check and
// round-trips through /login with ?next= so the invite survives sign-in.
export default async function AcceptInvitationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	const { data: session } = await authClient.getSession({
		fetchOptions: { headers: await headers() },
	});
	if (!session?.user) {
		redirect(`/login?next=${encodeURIComponent(`/accept-invitation/${id}`)}`);
	}

	return (
		<div className="flex min-h-svh items-center justify-center">
			<AcceptInvitationClient invitationId={id} />
		</div>
	);
}
