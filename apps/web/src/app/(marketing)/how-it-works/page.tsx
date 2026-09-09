import type { Metadata } from "next";

import { ObservabilityGuide } from "@/components/marketing/how-it-works/observability-guide";

export const metadata: Metadata = {
  title: "AI observability, illustrated",
  description:
    "Follow a request through an illustrated AI workshop. Learn how traces, agents, workflows, evaluations, and alerts connect in Foglamp.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "AI observability, illustrated · Foglamp",
    description: "A little light on what happens inside your AI app.",
    images: [
      {
        url: "/illustrations/ai-workshop.webp",
        width: 1536,
        height: 1024,
        alt: "An illustrated cutaway of an AI workshop",
      },
    ],
  },
};

export default function HowItWorksPage() {
  return <ObservabilityGuide />;
}
