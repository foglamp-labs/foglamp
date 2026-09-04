import { JsonLd } from "@/components/marketing/json-ld";
import { CtaSection } from "@/components/marketing/landing/cta";
import { Faq } from "@/components/marketing/landing/faq";
import { Hero } from "@/components/marketing/landing/hero";
import { Install } from "@/components/marketing/landing/install";
import { Problems } from "@/components/marketing/landing/problems";
import { Quote } from "@/components/marketing/landing/quote";
import { GITHUB_URL, SITE_URL } from "@/lib/links";

// schema.org graph for the homepage: who we are (Organization), the site
// (WebSite), and the product (SoftwareApplication) with its price range. Shared
// @id refs let consumers resolve the org once. Kept in sync with the root
// metadata description in app/layout.tsx and the pricing page's offers.
const ORG_ID = `${SITE_URL}/#organization`;
const homepageJsonLd = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": ORG_ID,
			name: "Foglamp",
			url: SITE_URL,
			logo: `${SITE_URL}/opengraph-image.png`,
			description:
				"The missing observability layer for AI agents built on the Vercel AI SDK.",
			sameAs: [GITHUB_URL],
		},
		{
			"@type": "WebSite",
			"@id": `${SITE_URL}/#website`,
			url: SITE_URL,
			name: "Foglamp",
			publisher: { "@id": ORG_ID },
		},
		{
			"@type": "SoftwareApplication",
			name: "Foglamp",
			applicationCategory: "DeveloperApplication",
			operatingSystem: "Web, Node.js",
			url: SITE_URL,
			description:
				"Observability for AI agents: costs, latency, tokens, distributed traces, evals, and alerts on every generateText and streamText call.",
			offers: {
				"@type": "AggregateOffer",
				priceCurrency: "USD",
				lowPrice: "0",
				highPrice: "49",
				offerCount: 3,
			},
			publisher: { "@id": ORG_ID },
		},
	],
};

// Shared landing content, rendered by both `/` (which redirects logged-in
// users to the dashboard) and `/homepage` (which never redirects). Order:
// the live demo in the hero, the three problems, the two-line setup, a quote,
// the FAQ with the public Foggy under it, and the fog CTA into the footer.
export function LandingPage() {
	return (
		// No bottom padding: the CTA runs straight into the footer.
		<div className="flex flex-col">
			<JsonLd data={homepageJsonLd} />
			<Hero />
			<Problems />
			<Install />
			<Quote />
			<Faq />
			<div className="h-16 sm:h-24" />
			<CtaSection />
		</div>
	);
}
