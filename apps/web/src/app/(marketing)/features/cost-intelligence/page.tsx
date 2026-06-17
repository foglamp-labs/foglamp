import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import {
  FrameCard,
  Sparkline,
  StackedBars,
  StatRow,
} from "@/components/marketing/feature/visuals";
import { productBySlug } from "@/components/marketing/products";

const product = productBySlug("cost-intelligence")!;
const ACCENT = "text-amber-500";

export const metadata: Metadata = {
  title: "Cost intelligence",
  description: product.tagline,
  openGraph: {
    title: "Cost intelligence · Foglamp",
    description: product.tagline,
  },
};

export default function CostIntelligencePage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <ProductHero
        product={product}
        headline="Know exactly what every call costs."
        sub="Foglamp prices every generateText and streamText call from real token usage — broken down by model, agent, and customer, in real time."
        visual={
          <FrameCard>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-sm font-medium">Spend · last 24h</span>
              <span className="font-mono text-sm text-muted-foreground">
                $842.17
              </span>
            </div>
            <Sparkline tint="var(--color-amber-500)" />
            <div className="mt-4">
              <StatRow
                items={[
                  { value: "$842", label: "today" },
                  { value: "$25.3k", label: "this month" },
                  { value: "98%", label: "priced" },
                ]}
              />
            </div>
          </FrameCard>
        }
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Attribution"
        title="Every dollar, attributed."
        description="Stop guessing where spend goes. Foglamp splits cost across models, agents, workflows, and even individual customers — using live provider pricing so the numbers actually match your bill."
        bullets={[
          "Per-model, per-agent, and per-customer breakdowns",
          "Live pricing for OpenAI, Anthropic, and 100+ models",
          "Cached vs. fresh token accounting",
        ]}
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">Spend by model</div>
            <StackedBars />
          </FrameCard>
        }
        primaryCta={{ label: "Start free", href: "/login" }}
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Regressions"
        title="Catch cost spikes before billing does."
        description="A prompt change ships and spend doubles overnight. Foglamp surfaces the jump the moment it happens and ties it back to the exact agent and model driving it."
        bullets={[
          "Day-over-day deltas on every metric",
          "Drill from a spike straight to the responsible traces",
          "Pair with alerts for a hard daily spend ceiling",
        ]}
        visualPosition="left"
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">Cost over time</div>
            <Sparkline tint="var(--color-amber-500)" />
          </FrameCard>
        }
        secondaryCta={{ label: "See alerts", href: "/features/alerts" }}
      />

      <CtaSection />
    </div>
  );
}
