import type { Metadata } from "next";

import { CodeBlock } from "@/components/marketing/code-block";
import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import { FrameCard, StatRow } from "@/components/marketing/feature/visuals";
import { CtaSection } from "@/components/marketing/landing/cta";
import { productBySlug } from "@/components/marketing/products";
import { INSTALL_CMD, INSTALL_CODE } from "@/components/marketing/snippets";

const product = productBySlug("sdk")!;
const ACCENT = "text-sky-500";

export const metadata: Metadata = {
	title: "SDK",
	description: product.tagline,
	openGraph: { title: "SDK · Foglamp", description: product.tagline },
	alternates: { canonical: product.href },
};

export default function SdkPage() {
	return (
		<div className="flex flex-col gap-36 pb-42">
			<ProductHero
				product={product}
				headline="Two lines. Every AI SDK call, instrumented."
				sub="Register Foglamp once with AI SDK v7 and every generateText and streamText call is traced and costed. Using v4-v6? The version-aware wrapper gives you the same traces."
				visual={
					<div className="mx-auto max-w-2xl">
						<CodeBlock code={INSTALL_CODE} filename="model.ts" />
					</div>
				}
			/>

			<FeatureSection
				accentClassName={ACCENT}
				eyebrow="Drop-in"
				title="Built for the code you already wrote."
				description="Foglamp uses AI SDK v7's native telemetry integration and a version-aware wrapper for v4-v6. Your prompts, models, tools, and control flow stay exactly as they are."
				bullets={[
					"Works with Vercel AI SDK v4 through v7",
					"No prompt or business-logic changes",
					"TypeScript-first, fully typed",
				]}
				visual={
					<FrameCard>
						<div className="mb-3 text-sm font-medium">Install</div>
						<CodeBlock code={INSTALL_CMD} copy />
					</FrameCard>
				}
				primaryCta={{ label: "Start free", href: "/login" }}
			/>

			<FeatureSection
				accentClassName={ACCENT}
				eyebrow="Zero overhead"
				title="Telemetry that stays out of the hot path."
				description="Spans are batched and flushed asynchronously, so instrumentation never blocks a response. Set one environment variable and you're streaming traces to your dashboard."
				bullets={[
					"Async, batched span export, no added latency",
					"Single FOGLAMP_API_KEY to authenticate",
					"Open standards under the hood",
				]}
				visualPosition="left"
				visual={
					<FrameCard>
						<div className="mb-4 text-sm font-medium">Captured per call</div>
						<StatRow
							items={[
								{ value: "100%", label: "calls traced" },
								{ value: "0ms", label: "added latency" },
								{ value: "2", label: "lines to add" },
							]}
						/>
					</FrameCard>
				}
				secondaryCta={{ label: "See the dashboard", href: "/" }}
			/>

			<CtaSection />
		</div>
	);
}
