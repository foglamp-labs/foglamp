import { cn } from "@foglamp/ui/lib/utils";

// A kit of self-contained, dependency-free visuals for the product pages. All
// pure SVG/CSS (no Recharts, no client state) so they server-render and stay
// cheap — the real, interactive charts live in the lazy landing-page demo.

export function FrameCard({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-lg squircle:rounded-3xl corner-squircle bg-card p-6 shadow-(--custom-shadow)",
				className,
			)}
		>
			{children}
		</div>
	);
}

// Area sparkline ramping like a workday. `tint` is a full CSS color expression.
export function Sparkline({
	tint = "var(--color-amber-500)",
}: { tint?: string }) {
	return (
		<svg
			viewBox="0 0 320 120"
			preserveAspectRatio="none"
			className="h-40 w-full"
		>
			<defs>
				<linearGradient id="vis-spark" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={tint} stopOpacity="0.3" />
					<stop offset="1" stopColor={tint} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path
				d="M0 104 L29 96 L58 92 L87 72 L116 54 L145 30 L174 16 L203 28 L232 48 L261 64 L290 84 L320 96 L320 120 L0 120 Z"
				fill="url(#vis-spark)"
			/>
			<path
				d="M0 104 L29 96 L58 92 L87 72 L116 54 L145 30 L174 16 L203 28 L232 48 L261 64 L290 84 L320 96"
				fill="none"
				stroke={tint}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Stacked spend-by-model bars.
export function StackedBars() {
	const cols = [
		[18, 12, 5],
		[28, 18, 7],
		[40, 26, 9],
		[52, 34, 11],
		[44, 28, 9],
		[30, 20, 7],
		[20, 13, 5],
	];
	const tints = ["bg-amber-500/80", "bg-violet-500/70", "bg-blue-500/60"];
	return (
		<div className="flex h-40 items-end gap-2">
			{cols.map((stack, i) => (
				<div key={i} className="flex flex-1 flex-col-reverse gap-0.5">
					{stack.map((h, j) => (
						<div
							key={j}
							className={cn("w-full rounded-sm corner-squircle", tints[j])}
							style={{ height: h }}
						/>
					))}
				</div>
			))}
		</div>
	);
}

// Circular score gauge, 0–1.
export function ScoreGauge({
	value = 0.94,
	tint = "var(--color-fuchsia-500)",
}: { value?: number; tint?: string }) {
	const r = 52;
	const c = 2 * Math.PI * r;
	const dash = c * value;
	return (
		<div className="flex h-40 items-center justify-center">
			<div className="relative">
				<svg viewBox="0 0 128 128" className="size-36 -rotate-90">
					<circle
						cx="64"
						cy="64"
						r={r}
						fill="none"
						stroke="var(--border)"
						strokeWidth="10"
					/>
					<circle
						cx="64"
						cy="64"
						r={r}
						fill="none"
						stroke={tint}
						strokeWidth="10"
						strokeLinecap="round"
						strokeDasharray={`${dash} ${c}`}
					/>
				</svg>
				<div className="absolute inset-0 flex flex-col items-center justify-center">
					<span className="text-3xl font-semibold tabular-nums">
						{value.toFixed(2)}
					</span>
					<span className="text-xs text-muted-foreground">avg score</span>
				</div>
			</div>
		</div>
	);
}

// Segmented pass/fail strip with a headline rate.
export function PassFailStrip({
	pass = 9,
	fail = 1,
}: { pass?: number; fail?: number }) {
	const total = pass + fail;
	return (
		<div className="flex h-40 flex-col justify-center gap-3">
			<div className="flex items-baseline justify-between">
				<span className="text-3xl font-semibold tabular-nums">
					{Math.round((pass / total) * 100)}%
				</span>
				<span className="text-sm text-muted-foreground">pass rate</span>
			</div>
			<div className="flex gap-1">
				{Array.from({ length: total }).map((_, i) => (
					<span
						key={i}
						className={cn(
							"h-3 flex-1 rounded-full",
							i < pass ? "bg-emerald-500/80" : "bg-rose-500/70",
						)}
					/>
				))}
			</div>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>tone · groundedness · valid-json</span>
				<span>6.1k scored</span>
			</div>
		</div>
	);
}

export function AlertCardVisual() {
	return (
		<div className="flex h-40 flex-col justify-center gap-3">
			<div className="flex items-center gap-2.5 rounded-md squircle:rounded-2xl corner-squircle bg-rose-500/10 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]">
				<span className="relative grid size-3 place-items-center">
					<span className="absolute size-3 animate-ping rounded-full bg-rose-500/50" />
					<span className="relative size-2 rounded-full bg-rose-500" />
				</span>
				<span className="text-sm font-medium">Error-rate spike</span>
				<span className="ml-auto font-mono text-sm text-rose-500">3.1%</span>
			</div>
			<div className="flex items-center gap-2.5 rounded-md squircle:rounded-2xl corner-squircle bg-emerald-500/10 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]">
				<span className="size-2 rounded-full bg-emerald-500" />
				<span className="text-sm font-medium">Daily spend ceiling</span>
				<span className="ml-auto font-mono text-sm text-emerald-600 dark:text-emerald-400">
					OK
				</span>
			</div>
		</div>
	);
}

export function WaterfallVisual() {
	const bars = [
		{ left: 0, width: 100, c: "bg-amber-500/70", label: "support-triage" },
		{ left: 4, width: 22, c: "bg-violet-500/70", label: "classify" },
		{ left: 26, width: 12, c: "bg-blue-500/70", label: "fetch-order" },
		{ left: 38, width: 30, c: "bg-blue-500/70", label: "search-kb" },
		{ left: 44, width: 20, c: "bg-violet-500/70", label: "rerank" },
		{ left: 68, width: 30, c: "bg-violet-500/70", label: "draft-reply" },
	];
	return (
		<div className="flex h-40 flex-col justify-center gap-2">
			{bars.map((b, i) => (
				<div key={i} className="grid grid-cols-[5rem_1fr] items-center gap-2">
					<span className="truncate text-[11px] text-muted-foreground">
						{b.label}
					</span>
					<div className="relative h-2.5">
						<span
							className={cn("absolute top-0 h-2.5 rounded-full", b.c)}
							style={{ left: `${b.left}%`, width: `${b.width}%` }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

export function FlowStripVisual() {
	const nodes = [
		{ c: "bg-violet-500", label: "classify" },
		{ c: "bg-blue-500", label: "fetch-order" },
		{ c: "bg-blue-500", label: "search-kb" },
		{ c: "bg-violet-500", label: "draft-reply" },
	];
	return (
		<div className="flex h-40 items-center justify-center gap-1">
			{nodes.map((n, i) => (
				<div key={i} className="flex items-center gap-1">
					<div className="flex flex-col items-center gap-1.5">
						<span
							className={cn(
								"grid size-10 place-items-center rounded-md squircle:rounded-2xl corner-squircle text-white shadow-(--custom-shadow)",
								n.c,
							)}
						>
							<span className="size-3.5 rounded-full bg-white/80" />
						</span>
						<span className="text-[10px] text-muted-foreground">{n.label}</span>
					</div>
					{i < nodes.length - 1 && (
						<span className="mb-5 h-px w-6 bg-foreground/20" />
					)}
				</div>
			))}
		</div>
	);
}

export function StatRow({
	items,
}: { items: { value: string; label: string }[] }) {
	return (
		<div className="grid grid-cols-3 gap-3">
			{items.map((s) => (
				<div
					key={s.label}
					className="rounded-md squircle:rounded-2xl corner-squircle bg-muted/40 px-4 py-3 dark:bg-muted/20"
				>
					<div className="text-xl font-semibold tabular-nums">{s.value}</div>
					<div className="text-xs text-muted-foreground">{s.label}</div>
				</div>
			))}
		</div>
	);
}
