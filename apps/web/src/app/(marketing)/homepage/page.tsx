import { LandingPage } from "@/components/marketing/landing/landing-page";

// Same landing content as `/`, but without the logged-in redirect — so a
// signed-in user can always reach the marketing homepage. The navbar swaps
// its CTA to "Dashboard" when a session is present.
export default function HomepagePage() {
  return <LandingPage />;
}
