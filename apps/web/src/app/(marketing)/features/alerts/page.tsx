import type { Metadata } from "next";

import { FeatureSection } from "@/components/marketing/feature/feature-section";
import { ProductHero } from "@/components/marketing/feature/product-hero";
import {
	AlertCardVisual,
	FrameCard,
	StatRow,
} from "@/components/marketing/feature/visuals";
import { CtaSection } from "@/components/marketing/landing/cta";
import { productBySlug } from "@/components/marketing/products";

const product = productBySlug("alerts")!;
const ACCENT = "text-yellow-500";

export const metadata: Metadata = {
	title: "Alerts",
	description: product.tagline,
	openGraph: { title: "Alerts · Foglamp", description: product.tagline },
	alternates: { canonical: product.href },
};

export default function AlertsPage() {
	return (
		<div className="flex flex-col gap-36 pb-42">
			<ProductHero
				product={product}
				headline="Find out from a dashboard, not a customer."
				sub="Set threshold rules on cost, latency, error rate, and eval scores. Foglamp checks them every minute and tells you the moment something drifts."
				visual={
					<FrameCard className="mx-auto max-w-xl">
						<AlertCardVisual />
					</FrameCard>
				}
			/>

			<FeatureSection
				accentClassName={ACCENT}
				eyebrow="Thresholds"
				title="Rules on the metrics that matter."
				description="Spend over $1k/day. p95 latency past 5 seconds. Error rate above 2%. Eval pass rate under 85%. Set the threshold and choose how much recent traffic to evaluate."
				bullets={[
					"Cost, p95 latency, error rate, and eval pass-rate rules",
					"Evaluated every minute on rolling windows",
					"Clear current values beside every condition",
				]}
				visual={
					<FrameCard>
						<AlertCardVisual />
					</FrameCard>
				}
				primaryCta={{ label: "Start free", href: "/login" }}
			/>

			<FeatureSection
				accentClassName={ACCENT}
				eyebrow="Delivery"
				title="When it crosses the line, your team knows."
				description="Foglamp sends alerts to email and Slack as soon as a rule fires, then records the recovery so the dashboard and notification history stay in sync."
				bullets={[
					"Email and Slack delivery",
					"Current values and recent alert history",
					"Auto-resolves when the metric recovers",
				]}
				visualPosition="left"
				visual={
					<FrameCard>
						<div className="mb-4 text-sm font-medium">
							Status · last check 28s ago
						</div>
						<StatRow
							items={[
								{ value: "1", label: "firing" },
								{ value: "3", label: "healthy" },
								{ value: "60s", label: "interval" },
							]}
						/>
					</FrameCard>
				}
				secondaryCta={{
					label: "See cost intelligence",
					href: "/features/cost-intelligence",
				}}
			/>

			<CtaSection />
		</div>
	);
}
