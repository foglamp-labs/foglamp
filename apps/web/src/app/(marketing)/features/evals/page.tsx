import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import {
  FrameCard,
  PassFailStrip,
  ScoreGauge,
} from "@/components/marketing/feature/visuals";
import { productBySlug } from "@/components/marketing/products";

const product = productBySlug("evals")!;
const ACCENT = "text-fuchsia-500";

export const metadata: Metadata = {
  title: "Evals",
  description: product.tagline,
  openGraph: { title: "Evals · Foglamp", description: product.tagline },
};

export default function EvalsPage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <ProductHero
        product={product}
        headline="Score every answer. Catch the regressions."
        sub="Run code checks and LLM judges against live production traffic on a 0–1 scale — so quality is a number you watch, not a vibe you hope for."
        visual={
          <FrameCard className="grid gap-6 sm:grid-cols-2">
            <ScoreGauge value={0.94} tint="var(--color-fuchsia-500)" />
            <PassFailStrip pass={9} fail={1} />
          </FrameCard>
        }
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Two kinds of checks"
        title="Code checks and LLM judges, side by side."
        description="Deterministic checks for the things that must be exactly right — valid JSON, no PII, schema conformance — and model-graded judges for the fuzzy stuff like tone and groundedness."
        bullets={[
          "Code evals run inline, no model cost",
          "LLM judges grade tone, helpfulness, and groundedness",
          "Every eval scored 0–1 with a pass threshold you set",
        ]}
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">Score distribution</div>
            <div className="flex h-40 items-end gap-2">
              {[8, 14, 41, 132, 386, 819].map((n, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div
                    className="w-full rounded-sm corner-squircle bg-fuchsia-500/70"
                    style={{ height: `${(n / 819) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {(i * 0.2).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </FrameCard>
        }
        primaryCta={{ label: "Start free", href: "/login" }}
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="On real traffic"
        title="Evals where your users actually are."
        description="Don't grade a static test set and hope. Foglamp scores sampled production traces, so your pass rate reflects what real users are getting today."
        bullets={[
          "Sample a fixed rate or score everything",
          "Drill from a failing score to the exact trace",
          "Trend pass rate per agent over time",
        ]}
        visualPosition="left"
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">
              Pass rate · answer-groundedness
            </div>
            <PassFailStrip pass={8} fail={2} />
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
