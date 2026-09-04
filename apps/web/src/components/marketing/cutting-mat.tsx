// The footer's closing image: the three brand circles redrawn as dashed guides
// on a faint cutting mat, cropped by the bottom of the page. Everything is
// stroke in theme tokens, so it reads the same in light and dark.
//
// Each circle is two strokes: a muted dashed ring, and on top of it a ring with
// a single dash that steps around the circumference one dash at a time (a
// stepped stroke-dashoffset animation, see .mat-dash in index.css). pathLength
// normalizes every circle to 360 units, so the dash pattern is written in
// degrees: 36 dashes of 6, gaps of 4.
const CIRCLES = [
	{ cx: 24, delay: "0s" },
	{ cx: 48, delay: "-1.6s" },
	{ cx: 72, delay: "-3.2s" },
];

export function CuttingMat() {
	return (
		<div
			aria-hidden
			className="pointer-events-none relative h-52 w-full select-none overflow-hidden sm:h-64"
		>
			{/* The mat: a fine grid with a heavier line every fifth cell, fading
          in from the top so it doesn't hit the copyright row as a hard edge. */}
			<div
				className="absolute inset-0 text-border"
				style={{
					backgroundImage: [
						"linear-gradient(to right, color-mix(in oklab, currentColor 55%, transparent) 1px, transparent 1px)",
						"linear-gradient(to bottom, color-mix(in oklab, currentColor 55%, transparent) 1px, transparent 1px)",
						"linear-gradient(to right, color-mix(in oklab, currentColor 28%, transparent) 1px, transparent 1px)",
						"linear-gradient(to bottom, color-mix(in oklab, currentColor 28%, transparent) 1px, transparent 1px)",
					].join(", "),
					backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
					backgroundPosition: "center top",
					WebkitMaskImage:
						"linear-gradient(to bottom, transparent, #000 45%)",
					maskImage: "linear-gradient(to bottom, transparent, #000 45%)",
				}}
			/>

			{/* The mark. Wider than the mat is tall on purpose: the container's
          overflow crops the lower third of the circles. */}
			<svg
				viewBox="0 0 96 48"
				className="absolute left-1/2 top-10 w-[min(640px,100%)] -translate-x-1/2 sm:top-12"
				style={{ overflow: "visible" }}
			>
				{CIRCLES.map((c) => (
					<g key={c.cx}>
						<circle
							cx={c.cx}
							cy="24"
							r="23.5"
							pathLength={360}
							fill="none"
							className="stroke-muted-foreground/45"
							strokeWidth="0.45"
							strokeDasharray="6 4"
							strokeLinecap="butt"
						/>
						<circle
							cx={c.cx}
							cy="24"
							r="23.5"
							pathLength={360}
							fill="none"
							className="mat-dash stroke-primary"
							strokeWidth="0.45"
							strokeDasharray="6 354"
							strokeLinecap="butt"
							style={{ animationDelay: c.delay }}
						/>
					</g>
				))}
			</svg>
		</div>
	);
}
