import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { PosterHero } from "./poster-hero";

export const metadata: Metadata = {
  title: "Codebase Poster",
  description:
    "Generate a beautiful, shareable map of how your codebase works and how it uses AI — from your own coding agent. No install, no account.",
  openGraph: {
    title: "Codebase Poster · Foglamp",
    description:
      "One prompt turns your repo into a beautiful, interactive map of how it uses AI.",
  },
  alternates: { canonical: "/poster" },
};

export default function PosterLandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-32">
      <PosterHero />
      <CtaSection />
    </div>
  );
}
