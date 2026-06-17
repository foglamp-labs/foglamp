"use client";

import {
  type ChartConfig,
  ChartContainer,
  LoadingIndicator,
} from "@/components/evilcharts/ui/chart";
import { ChartLegend, ChartLegendContent, type ChartLegendVariant } from "@/components/evilcharts/ui/legend";
import {
  ChartTooltip,
  ChartTooltipContent,
  type TooltipRoundness,
  type TooltipVariant,
} from "@/components/evilcharts/ui/tooltip";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import { Cell, Pie, PieChart as RechartsPieChart } from "recharts";
import type { ValueType } from "recharts/types/component/DefaultTooltipContent";

// A donut slice: `key` must exist in the chart config (it drives the slice's
// color + label), `value` is the slice's share.
export type DonutSlice = {
  key: string;
  value: number;
};

type EvilDonutChartProps = {
  config: ChartConfig; // slice colors + labels, keyed by DonutSlice.key
  data: DonutSlice[]; // slices; zero/negative values are dropped (they break recharts pies)
  className?: string; // extra classes for the chart container
  chartProps?: ComponentProps<typeof RechartsPieChart>; // escape hatch for the raw Recharts chart
  innerRadius?: number | string; // hole size — the "donut" part
  outerRadius?: number | string;
  paddingAngle?: number; // gap between slices, in degrees
  cornerRadius?: number; // rounding of each slice's ends
  centerLabel?: ReactNode; // headline rendered in the hole (e.g. total cost)
  centerSubLabel?: ReactNode; // smaller line under the headline
  showLegend?: boolean;
  legendVariant?: ChartLegendVariant;
  tooltipVariant?: TooltipVariant;
  tooltipRoundness?: TooltipRoundness;
  // Formats the numeric value shown in the tooltip rows.
  valueFormatter?: (value: ValueType, key: string) => ReactNode;
  isLoading?: boolean;
};

/**
 * Donut (pie-with-a-hole) chart in the evilcharts pattern: colors and labels
 * come from a `ChartConfig` (CSS vars scoped by `ChartStyle`), and it reuses
 * the shared tooltip + legend. Single-series — each data row is one slice.
 */
export function EvilDonutChart({
  config,
  data,
  className,
  chartProps,
  innerRadius = "62%",
  outerRadius = "85%",
  paddingAngle = 2,
  cornerRadius = 4,
  centerLabel,
  centerSubLabel,
  showLegend = false,
  legendVariant,
  tooltipVariant,
  tooltipRoundness,
  valueFormatter,
  isLoading = false,
}: EvilDonutChartProps) {
  // Zero/negative slices render as invisible degenerate sectors in recharts
  // (and still show up in tooltips/legend) — drop them up front.
  const slices = useMemo(() => data.filter((d) => d.value > 0), [data]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <ChartContainer className={className} config={config}>
        <RechartsPieChart accessibilityLayer {...chartProps}>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                nameKey="key"
                variant={tooltipVariant}
                roundness={tooltipRoundness}
                valueFormatter={
                  valueFormatter
                    ? (value, dataKey) => valueFormatter(value, dataKey)
                    : undefined
                }
              />
            }
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={paddingAngle}
            cornerRadius={cornerRadius}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.key} fill={`var(--color-${slice.key}-0)`} />
            ))}
          </Pie>
          {showLegend && (
            <ChartLegend
              verticalAlign="bottom"
              // Span the full width so the wrapped, centered legend stays
              // centered — otherwise Recharts sizes the wrapper to the
              // content's single-line width and anchors it off-center.
              wrapperStyle={{ left: 0, width: "100%" }}
              content={<ChartLegendContent align="center" variant={legendVariant} />}
            />
          )}
        </RechartsPieChart>
      </ChartContainer>
      <LoadingIndicator isLoading={isLoading} />
      {(centerLabel != null || centerSubLabel != null) && (
        <div
          className={
            // Offset the overlay up by half the legend's height so it stays
            // centered on the donut hole, not the whole container.
            showLegend
              ? "pointer-events-none absolute inset-0 bottom-8 flex flex-col items-center justify-center"
              : "pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          }
        >
          {centerLabel != null && (
            <span className="text-foreground text-xl font-semibold tabular-nums">
              {centerLabel}
            </span>
          )}
          {centerSubLabel != null && (
            <span className="text-muted-foreground text-xs">{centerSubLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
