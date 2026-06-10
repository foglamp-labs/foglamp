import { BentoGrid } from "@/components/marketing/landing/bento";
import { CtaSection } from "@/components/marketing/landing/cta";
import { Hero } from "@/components/marketing/landing/hero";
import { QuoteBand } from "@/components/marketing/landing/quote";

// Shared landing content, rendered by both `/` (which redirects logged-in
// users to the dashboard) and `/homepage` (which never redirects). The live
// dashboard demo now lives inside <Hero> (bleeding off the right edge), so
// there's no longer a standalone demo section.
export function LandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-12">
      <Hero />
      <QuoteBand />
      <BentoGrid />
      <CtaSection />
    </div>
  );
}
