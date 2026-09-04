"use client";

import { Button } from "@foglamp/ui/components/button";
import {
	motion,
	useInView,
	useReducedMotion,
	useScroll,
	useTransform,
} from "motion/react";
import Link from "next/link";
import { useRef } from "react";

import { FogBank } from "@/components/marketing/noise-overlay";

import { CopyPromptButton } from "./copy-prompt-button";
import { AgentDetails } from "./cta-agent-details";

// The closing CTA. The agent details on the right start swallowed by fog and
// sharpen as the section scrolls into view: the fog thins, the blur lifts.
// "All there, all invisible" becomes "all there" by the time you reach the
// buttons. Reduced-motion users get the cleared version, still.

const LAYERS = [
	{
		id: "fog-a",
		opacity: 0.3,
		blur: 4,
		anim: "fog-drift-a",
		dur: "26s",
		mask: "radial-gradient(40% 30% at 26% 44%, #000 5%, transparent 74%)",
		freq: 0.011,
		seed: 7,
		octaves: 4,
	},
	{
		id: "fog-b",
		opacity: 0.2,
		blur: 5,
		anim: "fog-drift-b",
		dur: "34s",
		mask: "radial-gradient(44% 34% at 54% 60%, #000 20%, transparent 72%)",
		freq: 0.02,
		seed: 19,
		octaves: 5,
	},
	{
		id: "fog-c",
		opacity: 0.05,
		blur: 10,
		anim: "fog-drift-c",
		dur: "41s",
		mask: "radial-gradient(30% 26% at 78% 32%, #000 20%, transparent 72%)",
		freq: 0.016,
		seed: 53,
		octaves: 4,
	},
	{
		id: "fog-d",
		opacity: 0.45,
		blur: 18,
		anim: "fog-drift-d",
		dur: "30s",
		mask: "radial-gradient(38% 30% at 72% 70%, #000 22%, transparent 72%)",
		freq: 0.014,
		seed: 83,
		octaves: 4,
	},
	{
		id: "fog-e",
		opacity: 0.4,
		blur: 12,
		anim: "fog-drift-e",
		dur: "24s",
		mask: "radial-gradient(30% 24% at 68% 46%, #000 30%, transparent 70%)",
		freq: 0.018,
		seed: 47,
		octaves: 5,
	},
];

const CLOUD_MASK =
	"linear-gradient(to right, transparent 4%, #000 42%), linear-gradient(to bottom, transparent 10%, #000 32%, #000 68%, transparent 90%)";

export function CtaSection() {
	const reduce = useReducedMotion() ?? false;
	const ref = useRef<HTMLElement>(null);
	// The fog only exists while the section is near the viewport: five drifting
	// blurred layers animating off-screen is wasted GPU.
	const inView = useInView(ref, { margin: "30% 0px 30% 0px" });

	// 0 when the section's top reaches the bottom of the viewport, 1 when its
	// center reaches the center. The reveal happens over that scroll distance.
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "center center"],
	});
	const fogOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.42]);
	const detailOpacity = useTransform(scrollYProgress, [0.15, 1], [0.25, 1]);
	const detailFilter = useTransform(
		scrollYProgress,
		[0.15, 1],
		["blur(4px)", "blur(0px)"],
	);

	return (
		<section
			ref={ref}
			className="relative isolate mb-20 flex w-full flex-col justify-center overflow-hidden"
			style={{ minHeight: "780px" }}
		>
			{/* The fog: five drifting layers, each masked to its own soft blob so
          the cloud reads organic rather than a strip. Fades out well before the
          section edges. */}
			{inView && (
				<motion.div
					className="absolute inset-0 z-10"
					aria-hidden
					style={{
						opacity: reduce ? 0.5 : fogOpacity,
						WebkitMaskImage: CLOUD_MASK,
						maskImage: CLOUD_MASK,
						WebkitMaskComposite: "source-in",
						maskComposite: "intersect",
					}}
				>
					{LAYERS.map((l) => (
						<div
							key={l.id}
							className="fog-layer absolute inset-[-15%]"
							style={{
								opacity: l.opacity,
								filter: `blur(${l.blur}px)`,
								animationName: l.anim,
								animationDuration: l.dur,
								WebkitMaskImage: l.mask,
								maskImage: l.mask,
							}}
						>
							<FogBank id={l.id} freq={l.freq} seed={l.seed} octaves={l.octaves} />
						</div>
					))}
				</motion.div>
			)}

			{/* The agent details under the fog on the right. Soft and dim until
          the section is in view, then sharp. */}
			<div className="absolute inset-0 z-5 mx-auto hidden w-full max-w-7xl items-center justify-end px-5 sm:px-8 lg:flex">
				<motion.div
					className="w-[40%] pr-12"
					style={
						reduce
							? { opacity: 1, filter: "blur(0px)" }
							: { opacity: detailOpacity, filter: detailFilter }
					}
				>
					<AgentDetails />
				</motion.div>
			</div>

			{/* Headline block: above the fog, always fully legible. */}
			<div className="relative z-30 mx-auto w-full max-w-7xl px-5 sm:px-8">
				<div className="max-w-xl">
					<h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
						Your agents are running in the fog.
					</h2>
					<p className="mt-3 max-w-md text-muted-foreground text-pretty">
						What they cost, when they break, what they say. You can&rsquo;t see
						any of it. One prompt turns the light on.
					</p>
					<div className="mt-7 flex flex-wrap items-center gap-3">
						<CopyPromptButton />
						<Button
							render={<Link href="/login" />}
							size="lg"
							className="text-base"
							variant="secondary"
						>
							Start free
						</Button>
					</div>
				</div>
			</div>

			{/* Headline scrim: keeps the copy legible over the fog. */}
			<div
				className="pointer-events-none absolute inset-0 z-25"
				aria-hidden
				style={{
					background:
						"radial-gradient(125% 130% at -8% 34%, var(--background) 16%, transparent 54%)",
				}}
			/>
		</section>
	);
}
