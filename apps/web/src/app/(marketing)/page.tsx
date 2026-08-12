import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/marketing/landing/landing-page";
import { authClient } from "@/lib/auth-client";

// `/` is the canonical home. The identical content also lives at `/homepage`,
// which canonicalises here (see that file) to consolidate duplicate-content
// signals onto this URL.
export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

// The root marketing page: logged-in users are sent straight to their
// dashboard. The same landing content lives at `/homepage`, which never
// redirects (for logged-in users who explicitly want the marketing site).
export default async function RootPage() {
	const { data: session } = await authClient.getSession({
		fetchOptions: { headers: await headers() },
	});

	if (session?.user) {
		redirect("/overview");
	}

	return <LandingPage />;
}
