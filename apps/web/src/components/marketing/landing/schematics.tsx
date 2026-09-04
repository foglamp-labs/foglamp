// Voyager-style schematics for the problems section. Hand-drawn SVG: 1px
// strokes in currentColor, dashed guides, tick rulers, tiny mono labels, no
// fills. The parent sets the color (muted-foreground); the one element that
// matters in each drawing is drawn in the foreground color so the eye lands on
// it. Everything is static on purpose: the hero demo is the moving part of the
// page, these are the diagrams in the manual.

const LABEL = "font-mono uppercase";
const LABEL_SIZE = 7.5;
const LABEL_SPACING = 0.9;

function Label({
	x,
	y,
	children,
	anchor = "start",
	strong = false,
}: {
	x: number;
	y: number;
	children: string;
	anchor?: "start" | "middle" | "end";
	strong?: boolean;
}) {
	return (
		<text
			x={x}
			y={y}
			textAnchor={anchor}
			fontSize={LABEL_SIZE}
			letterSpacing={LABEL_SPACING}
			className={strong ? `${LABEL} fill-foreground` : `${LABEL} fill-current`}
			stroke="none"
		>
			{children}
		</text>
	);
}

const shared = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1,
	vectorEffect: "non-scaling-stroke" as const,
};

function polar(cx: number, cy: number, r: number, deg: number) {
	const rad = (deg * Math.PI) / 180;
	return { x: +(cx + r * Math.cos(rad)).toFixed(2), y: +(cy - r * Math.sin(rad)).toFixed(2) };
}

// Money: a spend gauge. Half dial with a tick ruler, a dashed inner guide, a
// threshold mark, and a needle that has already gone past it.
export function SpendDial({ className }: { className?: string }) {
	const cx = 160;
	const cy = 150;
	const r = 104;
	const limitDeg = 62;
	const needleDeg = 44;
	const ticks = [];
	for (let deg = 0; deg <= 180; deg += 6) {
		const major = deg % 30 === 0;
		const a = polar(cx, cy, r, deg);
		const b = polar(cx, cy, r - (major ? 12 : 6), deg);
		ticks.push(<line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
	}
	const arcStart = polar(cx, cy, r, 180);
	const arcEnd = polar(cx, cy, r, 0);
	const guide = 82;
	const gStart = polar(cx, cy, guide, 180);
	const gEnd = polar(cx, cy, guide, 0);
	const limitA = polar(cx, cy, r + 4, limitDeg);
	const limitB = polar(cx, cy, r - 16, limitDeg);
	const limitLabel = polar(cx, cy, r + 14, limitDeg);
	const tip = polar(cx, cy, 92, needleDeg);
	const tipLabel = polar(cx, cy, 118, needleDeg - 8);

	return (
		<svg
			viewBox="0 0 320 200"
			className={className}
			role="img"
			aria-label="A spend gauge whose needle has passed the alert threshold"
			{...shared}
		>
			<path d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`} />
			<path
				d={`M ${gStart.x} ${gStart.y} A ${guide} ${guide} 0 0 1 ${gEnd.x} ${gEnd.y}`}
				strokeDasharray="3 4"
			/>
			<g>{ticks}</g>
			<Label x={cx - r} y={cy + 14} anchor="start">
				$0
			</Label>
			<Label x={cx + r} y={cy + 14} anchor="end">
				$500
			</Label>
			<Label x={cx} y={cy + 30} anchor="middle">
				Spend per day
			</Label>

			{/* threshold */}
			<line x1={limitA.x} y1={limitA.y} x2={limitB.x} y2={limitB.y} strokeWidth={1.5} />
			<Label x={limitLabel.x + 4} y={limitLabel.y - 2} anchor="start">
				Alert at $300
			</Label>

			{/* needle, drawn in the foreground color */}
			<g className="stroke-foreground">
				<line x1={cx} y1={cy} x2={tip.x} y2={tip.y} strokeWidth={1.5} />
				<circle cx={cx} cy={cy} r={3.5} />
			</g>
			<circle cx={cx} cy={cy} r={10} strokeDasharray="2 3" />
			<Label x={tipLabel.x} y={tipLabel.y} anchor="start" strong>
				$347 today
			</Label>
		</svg>
	);
}

// Time: a trace waterfall over a tick ruler. The spans are outlined bars; the
// long one in the middle is the model call, with a dashed marker where the
// first token arrived.
const SPANS = [
	{ label: "plan", start: 0, width: 58 },
	{ label: "search_docs", start: 44, width: 46 },
	{ label: "generateText", start: 76, width: 104 },
	{ label: "refund_tool", start: 168, width: 24 },
	{ label: "reply", start: 190, width: 30 },
];

export function SpanWaterfall({ className }: { className?: string }) {
	const x0 = 96;
	const rulerY = 30;
	const len = 220;
	const ticks = [];
	for (let i = 0; i <= 20; i++) {
		const major = i % 5 === 0;
		const x = x0 + i * (len / 20);
		ticks.push(<line key={i} x1={x} y1={rulerY} x2={x} y2={rulerY - (major ? 8 : 4)} />);
	}
	const rowY = (i: number) => 52 + i * 26;
	const firstTokenX = x0 + 76 + 30;

	return (
		<svg
			viewBox="0 0 320 200"
			className={className}
			role="img"
			aria-label="A trace waterfall showing five spans over a time ruler"
			{...shared}
		>
			<line x1={x0} y1={rulerY} x2={x0 + len} y2={rulerY} />
			<g>{ticks}</g>
			{[0, 1, 2, 3, 4].map((i) => (
				<Label key={i} x={x0 + i * (len / 4)} y={rulerY - 12} anchor={i === 4 ? "end" : i === 0 ? "start" : "middle"}>
					{`${(i * 0.6).toFixed(1)}s`}
				</Label>
			))}

			{SPANS.map((s, i) => {
				const y = rowY(i);
				const isModel = s.label === "generateText";
				return (
					<g key={s.label} className={isModel ? "stroke-foreground" : undefined}>
						<Label x={x0 - 8} y={y + 9} anchor="end" strong={isModel}>
							{s.label}
						</Label>
						<rect x={x0 + s.start} y={y} width={s.width} height={12} />
						{isModel && (
							<line
								x1={x0 + s.start}
								y1={y + 6}
								x2={x0 + s.start + s.width}
								y2={y + 6}
								strokeDasharray="1 3"
							/>
						)}
					</g>
				);
			})}

			{/* first-token marker */}
			<line
				x1={firstTokenX}
				y1={rowY(0) - 6}
				x2={firstTokenX}
				y2={rowY(4) + 20}
				strokeDasharray="3 3"
			/>
			<Label x={firstTokenX - 5} y={rowY(4) + 24} anchor="end">
				First token 1.2s
			</Label>
			<Label x={x0 + len} y={rowY(4) + 24} anchor="end">
				Total 2.3s
			</Label>
		</svg>
	);
}

// Safety: an eval pass rate over two weeks, drifting down and crossing the
// dashed alert line. The crossing point is the one thing drawn in foreground.
const RATES = [96, 95, 97, 94, 96, 95, 93, 94, 92, 88, 84, 79, 74, 71];

export function PassRateCurve({ className }: { className?: string }) {
	const x0 = 44;
	const x1 = 304;
	const yTop = 40;
	const yBottom = 160;
	const yFor = (v: number) => +(yBottom - ((v - 60) / 40) * (yBottom - yTop)).toFixed(2);
	const xFor = (i: number) => +(x0 + (i / (RATES.length - 1)) * (x1 - x0)).toFixed(2);
	const points = RATES.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
	const threshold = 85;
	const ty = yFor(threshold);

	// Where the curve crosses the threshold, interpolated between two days.
	let cross = { x: 0, y: ty };
	for (let i = 1; i < RATES.length; i++) {
		const a = RATES[i - 1]!;
		const b = RATES[i]!;
		if (a >= threshold && b < threshold) {
			const t = (a - threshold) / (a - b);
			cross = { x: +(xFor(i - 1) + t * (xFor(i) - xFor(i - 1))).toFixed(2), y: ty };
			break;
		}
	}

	return (
		<svg
			viewBox="0 0 320 200"
			className={className}
			role="img"
			aria-label="An eval pass rate curve dropping below the alert threshold"
			{...shared}
		>
			{/* axes */}
			<line x1={x0} y1={yTop - 8} x2={x0} y2={yBottom} />
			<line x1={x0} y1={yBottom} x2={x1} y2={yBottom} />
			{[100, 90, 80, 70].map((v) => (
				<g key={v}>
					<line x1={x0 - 4} y1={yFor(v)} x2={x0} y2={yFor(v)} />
					<Label x={x0 - 8} y={yFor(v) + 3} anchor="end">
						{`${v}%`}
					</Label>
				</g>
			))}
			{RATES.map((_, i) => (
				<line key={i} x1={xFor(i)} y1={yBottom} x2={xFor(i)} y2={yBottom + (i % 7 === 0 ? 6 : 3)} />
			))}
			<Label x={x0} y={yBottom + 16} anchor="start">
				Day 1
			</Label>
			<Label x={x1} y={yBottom + 16} anchor="end">
				Day 14
			</Label>

			{/* threshold */}
			<line x1={x0} y1={ty} x2={x1} y2={ty} strokeDasharray="4 4" />
			<Label x={x0 + 6} y={ty - 5} anchor="start">
				Alert below 85%
			</Label>

			{/* the curve */}
			<polyline points={points} strokeLinejoin="round" />
			{RATES.map((v, i) => (
				<circle key={i} cx={xFor(i)} cy={yFor(v)} r={1.6} />
			))}

			{/* the crossing */}
			<g className="stroke-foreground">
				<circle cx={cross.x} cy={cross.y} r={4} />
			</g>
			<circle cx={cross.x} cy={cross.y} r={11} strokeDasharray="2 3" />
			<Label x={cross.x - 16} y={cross.y + 22} anchor="end" strong>
				Regression, day 10
			</Label>
		</svg>
	);
}
