"use client";

import { cn } from "@foglamp/ui/lib/utils";
import * as React from "react";
import * as RechartsPrimitive from "recharts";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

type ThemeKey = keyof typeof THEMES;

// All Keys are optional at first
type ThemeColorsBase = {
	[K in ThemeKey]?: string[];
};

// Require at least one theme key
type AtLeastOneThemeColor = {
	[K in ThemeKey]: Required<Pick<ThemeColorsBase, K>> &
		Partial<Omit<ThemeColorsBase, K>>;
}[ThemeKey];

const VALID_THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

// Validation for chart config colors at runtime
function validateChartConfigColors(config: ChartConfig): void {
	for (const [key, value] of Object.entries(config)) {
		if (value.colors) {
			const hasValidThemeKey = VALID_THEME_KEYS.some(
				(themeKey) => value.colors?.[themeKey] !== undefined,
			);

			if (!hasValidThemeKey) {
				throw new Error(
					`[EvilCharts] Invalid chart config for "${key}": colors object must have at least one theme key (${VALID_THEME_KEYS.join(", ")}). Received empty object or invalid keys.`,
				);
			}
		}
	}
}

export type ChartConfig = Record<
	string,
	{
		label?: React.ReactNode;
		icon?: React.ComponentType;
		colors?: AtLeastOneThemeColor;
	}
>;

interface ChartContextProps {
	config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

export function useChart() {
	const context = React.useContext(ChartContext);

	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}

	return context;
}

interface ChartContainerProps
	extends Omit<React.ComponentProps<"div">, "children">,
		Pick<
			React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>,
			| "initialDimension"
			| "aspect"
			| "debounce"
			| "minHeight"
			| "minWidth"
			| "maxHeight"
			| "height"
			| "width"
			| "onResize"
			| "children"
		> {
	config: ChartConfig;
	innerResponsiveContainerStyle?: React.ComponentProps<
		typeof RechartsPrimitive.ResponsiveContainer
	>["style"];
	/** Optional content rendered below the chart (e.g. EvilBrush) */
	footer?: React.ReactNode;
	/** Dims the plot while a refetch keeps stale data on screen. The dim eases
	 * in after a short transition delay, so fetches that resolve quickly never
	 * visibly flash it. */
	isUpdating?: boolean;
}

function ChartContainer({
	id,
	config,
	initialDimension = { width: 320, height: 200 },
	// Coalesce resize storms into a single re-render. Layout-driven tweens (the
	// Foggy panel animating its width, dragging its resize handle) fire the
	// ResizeObserver every frame; without a debounce each chart fully re-renders
	// its SVG per frame, which is what tanks the FPS on chart-heavy pages.
	debounce = 100,
	className,
	children,
	footer,
	isUpdating = false,
	...props
}: Readonly<ChartContainerProps>) {
	const uniqueId = React.useId();
	const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

	// Validate chart config at runtime
	validateChartConfigColors(config);

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				data-slot="chart"
				data-chart={chartId}
				className={cn(
					"min-h-0 w-full flex-1",
					"[&_.recharts-yAxis-tick-labels_.recharts-cartesian-axis-tick-value]:tabular-nums [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-muted-foreground/20 dark:[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-muted-foreground/50 [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border relative flex flex-col justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden [&_*:focus]:outline-none [&_*:focus-visible]:outline-none",
					!footer && "aspect-video",
					className,
				)}
				{...props}
			>
				<ChartStyle id={chartId} config={config} />
				<RechartsPrimitive.ResponsiveContainer
					className={cn(
						"min-h-0 w-full flex-1 transition-opacity",
						isUpdating ? "opacity-50 delay-150 duration-300" : "duration-150",
					)}
					initialDimension={initialDimension}
					debounce={debounce}
				>
					{children}
				</RechartsPrimitive.ResponsiveContainer>
				{footer}
			</div>
		</ChartContext.Provider>
	);
}

function LoadingIndicator({ isLoading }: { isLoading: boolean }) {
	if (!isLoading) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
			<div className="text-primary bg-background flex items-center justify-center gap-2 rounded-md border px-2 py-0.5 text-sm">
				<div className="border-border border-t-primary h-3 w-3 animate-spin rounded-full border" />
				<span>Loading</span>
			</div>
		</div>
	);
}

// Distribute colors evenly across slots, extra slots go to last color(s)
// Example: 2 colors for 4 slots → [red, red, pink, pink]
// Example: 3 colors for 4 slots → [red, pink, blue, blue]
function distributeColors(colorsArray: string[], maxCount: number): string[] {
	const availableCount = colorsArray.length;
	if (availableCount >= maxCount) {
		return colorsArray.slice(0, maxCount);
	}

	const result: string[] = [];
	const baseSlots = Math.floor(maxCount / availableCount);
	const extraSlots = maxCount % availableCount;

	// First (availableCount - extraSlots) colors get baseSlots each
	// Last extraSlots colors get (baseSlots + 1) each
	for (let colorIdx = 0; colorIdx < availableCount; colorIdx++) {
		const isExtraColor = colorIdx >= availableCount - extraSlots;
		const slotsForThisColor = baseSlots + (isExtraColor ? 1 : 0);
		for (let j = 0; j < slotsForThisColor; j++) {
			result.push(colorsArray[colorIdx]);
		}
	}

	return result;
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
	const colorConfig = Object.entries(config).filter(
		([, config]) => config.colors,
	);

	if (!colorConfig.length) {
		return null;
	}

	const generateCssVars = (theme: keyof typeof THEMES) =>
		colorConfig
			.flatMap(([key, itemConfig]) => {
				const colorsArray = itemConfig.colors?.[theme];
				if (
					!colorsArray ||
					!Array.isArray(colorsArray) ||
					colorsArray.length === 0
				) {
					return [];
				}

				// Get max count across all themes for this key
				const maxCount = getColorsCount(itemConfig);

				// Distribute colors evenly across all required slots
				const distributedColors = distributeColors(colorsArray, maxCount);

				return distributedColors.map(
					(color, index) => `  --color-${key}-${index}: ${color};`,
				);
			})
			.filter(Boolean)
			.join("\n");

	const css = Object.entries(THEMES)
		.map(
			([theme, prefix]) =>
				`${prefix} [data-chart=${id}] {\n${generateCssVars(theme as keyof typeof THEMES)}\n}`,
		)
		.join("\n");

	return <style dangerouslySetInnerHTML={{ __html: css }} />;
};

// Helper to extract item config from a payload.
export function getPayloadConfigFromPayload(
	config: ChartConfig,
	payload: unknown,
	key: string,
) {
	if (typeof payload !== "object" || payload === null) {
		return undefined;
	}

	const payloadPayload =
		"payload" in payload &&
		typeof payload.payload === "object" &&
		payload.payload !== null
			? payload.payload
			: undefined;

	let configLabelKey: string = key;

	if (
		key in payload &&
		typeof payload[key as keyof typeof payload] === "string"
	) {
		configLabelKey = payload[key as keyof typeof payload] as string;
	} else if (
		payloadPayload &&
		key in payloadPayload &&
		typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
	) {
		configLabelKey = payloadPayload[
			key as keyof typeof payloadPayload
		] as string;
	}

	return configLabelKey in config ? config[configLabelKey] : config[key];
}

// Format values to percent for expanded charts
function axisValueToPercentFormatter(value: number) {
	return `${Math.round(value * 100).toFixed(0)}%`;
}

// Snap a value up to the next "nice" number (1/1.2/1.5/2/2.5/3/4/5/6/8 × 10ⁿ).
// Used as the numeric y-axis max so live data refreshes only move the axis when
// the data actually outgrows the current nice bound — no per-refresh jitter.
function niceCeil(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	const exp = 10 ** Math.floor(Math.log10(value));
	const mantissa = value / exp;
	const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
	const step = steps.find((s) => s >= mantissa - 1e-9) ?? 10;
	return step * exp;
}

// Default numeric y-axis domain: zero-based with a nice, stable upper bound.
const niceDomain: [number, (dataMax: number) => number] = [
	0,
	(dataMax: number) => niceCeil(dataMax),
];

// Get max colors count across all themes for a config entry
function getColorsCount(config: ChartConfig[string]): number {
	if (!config.colors) return 1;
	const counts = VALID_THEME_KEYS.map(
		(theme) => config.colors?.[theme]?.length ?? 0,
	);
	return Math.max(...counts, 1);
}

// Generate random loading data for skeleton/loading state
// min/max represent percentage of the range (0-100), defaults to 20-80 for realistic look
export const getLoadingData = (points = 10, min = 0, max = 70) => {
	const range = max - min;
	return Array.from({ length: points }, () => ({
		loading: Math.floor(Math.random() * range) + min,
	}));
};

export {
	ChartContainer,
	ChartStyle,
	axisValueToPercentFormatter,
	LoadingIndicator,
	getColorsCount,
	niceCeil,
	niceDomain,
};
