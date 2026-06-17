import { BentoGrid } from "@/components/marketing/landing/bento";
import { CtaSection } from "@/components/marketing/landing/cta";
import { DriftStory } from "@/components/marketing/landing/drift-story";
import { Hero } from "@/components/marketing/landing/hero";
import { SocialProof } from "@/components/marketing/landing/social-proof";

// Shared landing content, rendered by both `/` (which redirects logged-in
// users to the dashboard) and `/homepage` (which never redirects). The live
// dashboard demo lives inside <Hero> (stacked below the copy), so there's no
// longer a standalone demo section. SocialProof sits right under the hero —
// the model-logo strip is factual; its testimonial is a placeholder (see file).
export function LandingPage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <Hero />
      <SocialProof />
      <DriftStory />
      <BentoGrid />
      <CtaSection />
    </div>
  );
}
