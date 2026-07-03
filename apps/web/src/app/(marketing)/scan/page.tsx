import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { ScanHero } from "./scan-hero";
import { StoryVariants } from "./story-variants";

export const metadata: Metadata = {
  title: "Codebase Scan",
  description:
    "Generate a beautiful, shareable map of how your codebase works and how it uses AI — from your own coding agent. No install, no account.",
  openGraph: {
    title: "Codebase Scan · Foglamp",
    description:
      "One prompt turns your repo into a beautiful, interactive map of how it uses AI.",
  },
  alternates: { canonical: "/scan" },
};

export default function ScanLandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-32">
      <ScanHero />
      <StoryVariants />
      <CtaSection />
    </div>
  );
}
