"use client";

import { cn } from "@foglamp/ui/lib/utils";

/** A two-line label/value stat, used in agent and workflow card grids.
 * `className` applies to the outer wrapper; `valueClassName` applies to the
 * value span (use for heat-tinted cost colors). */
export function Stat({
	label,
	value,
	emphasis,
	className,
	valueClassName,
}: {
	label: string;
	value: React.ReactNode;
	emphasis?: boolean;
	className?: string;
	valueClassName?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-0.5", className)}>
			<span className="text-xs text-muted-foreground">{label}</span>
			<span
				className={cn(
					"tabular-nums",
					emphasis && "font-medium",
					valueClassName,
				)}
			>
				{value}
			</span>
		</div>
	);
}
