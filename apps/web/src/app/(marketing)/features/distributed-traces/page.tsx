import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/landing/cta";
import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import {
  FrameCard,
  StatRow,
  WaterfallVisual,
} from "@/components/marketing/feature/visuals";
import { productBySlug } from "@/components/marketing/products";

const product = productBySlug("distributed-traces")!;
const ACCENT = "text-[#8b5e34] dark:text-[#c9a888]";

export const metadata: Metadata = {
  title: "Distributed traces",
  description: product.tagline,
  openGraph: {
    title: "Distributed traces · Foglamp",
    description: product.tagline,
  },
};

export default function DistributedTracesPage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <ProductHero
        product={product}
        headline="Waterfall every run, down to the token."
        sub="Each trace is one top-level call, expanded into a full span tree — nested agents, tools, and LLM calls, with the exact prompt and response for every step."
        visual={
          <FrameCard>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-sm font-medium">support-triage</span>
              <span className="font-mono text-xs text-muted-foreground">
                5.84s · 8 spans
              </span>
            </div>
            <WaterfallVisual />
          </FrameCard>
        }
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="The full tree"
        title="Nested spans, not flat logs."
        description="Foglamp reconstructs parent/child relationships across agents, tools, and models — so a multi-hop run reads as one coherent waterfall instead of a pile of disconnected log lines."
        bullets={[
          "Agent → tool → LLM nesting preserved",
          "Per-span duration, tokens, and cost",
          "Errors highlighted exactly where they happened",
        ]}
        visual={
          <FrameCard>
            <WaterfallVisual />
          </FrameCard>
        }
        primaryCta={{ label: "Start free", href: "/login" }}
      />

      <FeatureSection
        accentClassName={ACCENT}
        eyebrow="Replay"
        title="See the exact prompt and streamed response."
        description="Open any span to read the full system prompt, messages, and the response as it streamed — including time-to-first-token. No more reproducing bugs blind."
        bullets={[
          "Full prompt + response payload per span",
          "TTFT and token-by-token streaming replay",
          "Copy any message straight into a repro",
        ]}
        visualPosition="left"
        visual={
          <FrameCard>
            <div className="mb-4 text-sm font-medium">Span timing</div>
            <StatRow
              items={[
                { value: "520ms", label: "TTFT p95" },
                { value: "2.46s", label: "draft-reply" },
                { value: "4.2k", label: "tokens" },
              ]}
            />
          </FrameCard>
        }
        secondaryCta={{ label: "See agents", href: "/features/agents" }}
      />

      <CtaSection />
    </div>
  );
}
