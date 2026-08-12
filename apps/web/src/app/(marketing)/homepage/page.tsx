import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing/landing-page";

// Same landing content as `/`, but without the logged-in redirect — so a
// signed-in user can always reach the marketing homepage. The navbar swaps
// its CTA to "Dashboard" when a session is present.
//
// This is a deliberate duplicate of `/`, so canonicalise to `/`: search +
// answer engines consolidate all signals onto the home URL instead of splitting
// rank between two identical pages. (It's also kept out of sitemap.ts.)
export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

export default function HomepagePage() {
	return <LandingPage />;
}
