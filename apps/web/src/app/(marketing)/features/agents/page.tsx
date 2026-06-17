import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import {
  FlowStripVisual,
  FrameCard,
  StatRow,
} from "@/components/marketing/feature/visuals";
import { productBySlug } from "@/components/marketing/products";

const product = productBySlug("agents")!;
const ACCENT = "text-orange-500";

export const metadata: Metadata = {
  title: "Agents",
  description: product.tagline,
  openGraph: { title: "Agents · Foglamp", description: product.tagline },
};

export default function AgentsPage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <ProductHero
        product={product}
        headline="See every agent's spend, speed, and health."
        sub="Foglamp groups traffic by agent name automatically — so you can see which agents are slow, expensive, or failing, and watch the full call flow for each one."
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">
              support-triage · typical run
            </div>
            <FlowStripVisual />
          </FrameCard>
        }
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Per-agent rollups"
        title="One row per agent. All the numbers."
        description="Requests, error rate, p95 latency, spend, and eval pass rate — for every agentName seen in the last 24 hours. Spot the outlier in a glance."
        bullets={[
          "Automatic grouping by agent name",
          "Spend, latency, errors, and eval pass rate per agent",
          "Which models each agent actually calls",
        ]}
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">support-triage</div>
            <StatRow
              items={[
                { value: "6.2k", label: "requests" },
                { value: "2.81s", label: "p95" },
                { value: "96%", label: "eval pass" },
              ]}
            />
          </FrameCard>
        }
        primaryCta={{ label: "Start free", href: "/login" }}
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Call flow"
        title="Watch the agent think, step by step."
        description="Every agent run becomes a flow of LLM calls, tool calls, and sub-agents. See where time and tokens go, and exactly which step failed when something breaks."
        bullets={[
          "LLM, tool, and sub-agent steps as one flow",
          "Per-step duration, tokens, and status",
          "Jump from a flow node into its full trace",
        ]}
        visualPosition="left"
        visual={
          <FrameCard>
            <FlowStripVisual />
          </FrameCard>
        }
        secondaryCta={{
          label: "Explore traces",
          href: "/features/distributed-traces",
        }}
      />

      <CtaSection />
    </div>
  );
}
