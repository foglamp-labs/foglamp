"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconBoltFilled, IconMatrix } from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/marketing/brand-mark";
import { FilmGrain } from "@/components/marketing/noise-overlay";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The real HUD component from the published SDK, pointed at the always-on
// mock-agent demo (Cloud Run). It portals itself onto THIS page, so visitors
// see the actual product overlaying the pitch — the page is the playground.
// Client only: it opens an EventSource and has no server render.
const FoglampHUD = dynamic(
	() => import("foglamp/hud").then((m) => m.FoglampHUD),
	{ ssr: false, loading: () => null },
);

const DEMO_ORIGIN = "https://hud.foglamp.dev";

export function HudLanding() {
	const reduce = useReducedMotion() ?? false;
	const [state, setState] = useState<"idle" | "running" | "down">("idle");
	// Start the HUD expanded only where it fits beside the pitch; on small
	// screens the open panel would bury the whole page, so start as the pill.
	// `defaultOpen` is initial-state-only, so mount the HUD after we know the
	// viewport (it's client-only anyway — ssr: false).
	const [openWide, setOpenWide] = useState<boolean | null>(null);
	useEffect(() => {
		setOpenWide(window.matchMedia("(min-width: 1024px)").matches);
	}, []);
	const rise = (delay: number): MotionProps =>
		reduce
			? {}
			: {
					initial: { opacity: 0, y: 12, filter: "blur(6px)" },
					animate: { opacity: 1, y: 0, filter: "blur(0px)" },
					transition: { duration: 0.7, ease: EASE, delay },
				};

	async function runStorm() {
		setState("running");
		try {
			const res = await fetch(`${DEMO_ORIGIN}/api/storm`, {
				method: "POST",
				mode: "cors",
			});
			if (!res.ok) throw new Error(String(res.status));
			setTimeout(() => setState("idle"), 8000);
		} catch {
			setState("down");
		}
	}

	return (
		<div className="fixed inset-0 isolate overflow-hidden bg-background">
			{/* Same grain as the landing hero, but masked so it dissolves toward
          all four edges instead of running hard into the viewport border. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10"
				style={{
					WebkitMaskImage:
						"linear-gradient(to right, transparent, #000 52%, #000 82%, transparent), linear-gradient(to bottom, transparent, #000 50%, #000 18%, transparent)",
					maskImage:
						"linear-gradient(to right, transparent, #000 52%, #000 82%, transparent), linear-gradient(to bottom, transparent, #000 50%, #000 18%, transparent)",
					WebkitMaskComposite: "source-in",
					maskComposite: "intersect",
				}}
			>
				<FilmGrain
					id="hud-hero-noise"
					className="opacity-15 mix-blend-screen"
				/>
			</div>

			{/* The live demo — the real HUD overlay, already expanded and streaming
          the always-on demo agents. It anchors bottom-center by default (its
          :host styles), which would sit on top of the pitch — document-level
          rules on the host element outrank :host, so float it up into the
          empty center-right canvas on screens wide enough for the two-column
          layout, mirroring where the scan hero puts its demo map. */}
			{/* translateX(50%) pins the host's bottom-CENTER to the (right, bottom)
          point: the pill parks there, and the pill↔panel morph grows upward
          from that baseline, staying horizontally centered on the pill. */}
			<style>{`
        @media (min-width: 1024px) {
          foglamp-hud { left: auto; right: 30%; bottom: 15%; transform: translateX(50%); }
        }
        /* Mobile: lift the pill out of the bottom edge into the empty canvas
           just above the pitch (it stays horizontally centered by default). */
        @media (max-width: 1023px) {
          foglamp-hud { bottom: 24%; }
        }
      `}</style>
			{openWide !== null && (
				<FoglampHUD url={`${DEMO_ORIGIN}/hud/events`} defaultOpen={openWide} />
			)}

			{/* Top-left: the HUD mark. */}
			<div className="absolute top-8 left-8 z-10 sm:top-14 sm:left-14">
				<p className="flex items-center gap-1.5 text-base font-medium tracking-wide">
					<IconMatrix className="size-4" />
					HUD
				</p>
			</div>

			{/* Top-right: the way into the main product. */}
			<div className="absolute top-8 right-8 z-10 sm:top-10 sm:right-10">
				<Button
					variant="outline"
					render={<Link href="/homepage" />}
					className="px-3.5 has-[>svg:first-child]:pl-3 gap-2"
				>
					<BrandMark className="h-3! w-auto!" />
					Try Foglamp
				</Button>
			</div>

			{/* Bottom-left: the pitch. */}
			{/* bottom-24 on mobile clears the HUD pill parked bottom-center. */}
			<div className="absolute bottom-10 left-8 z-10 max-w-xl sm:bottom-20 sm:left-14">
				<motion.h1
					{...rise(0.15)}
					className="font-display text-2xl md:text-4xl font-semibold tracking-tight text-balance"
				>
					See your agents while you build.
				</motion.h1>
				<motion.p
					{...rise(0.27)}
					className="mt-4 max-w-lg md:text-lg text-base text-muted-foreground text-pretty"
				>
					See every agent working before they reach production.
				</motion.p>
				<motion.div
					{...rise(0.39)}
					className="md:mt-7 mt-6 flex flex-wrap items-center gap-3"
				>
					<Button size="lg" className="text-base" onClick={runStorm}>
						<IconBoltFilled className="size-4" />
						Run an agent storm
					</Button>
				</motion.div>
			</div>
		</div>
	);
}
