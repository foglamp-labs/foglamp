import type { Metadata } from "next";

import { HudLanding } from "./hud-landing";

export const metadata: Metadata = {
	title: "Foglamp HUD",
	description:
		"A live heads-up display for your AI agents while you build. Every call, tool step and retry, right in your app. Try it in the browser.",
	openGraph: {
		title: "Foglamp HUD",
		description: "A live heads-up display for your AI agents while you build.",
	},
	alternates: { canonical: "/hud" },
};

export default function HudLandingPage() {
	return <HudLanding />;
}
