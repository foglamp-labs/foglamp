import { BentoGrid } from "@/components/marketing/landing/bento";
import { CtaSection } from "@/components/marketing/landing/cta";
import { DemoSection } from "@/components/marketing/landing/demo-section";
import { Hero } from "@/components/marketing/landing/hero";
import { QuoteBand } from "@/components/marketing/landing/quote";

// Shared landing content, rendered by both `/` (which redirects logged-in
// users to the dashboard) and `/homepage` (which never redirects).
export function LandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-12">
      <Hero />
      <DemoSection />
      <QuoteBand />
      <BentoGrid />
      <CtaSection />
    </div>
  );
}
