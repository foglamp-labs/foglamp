"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconArrowUpRight,
	IconChevronRight,
	IconCpu,
	IconMessage2Filled,
} from "@tabler/icons-react";
import type { Route } from "next";
import { useState } from "react";

import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { navItem } from "@/components/app/nav";
import { PageHeader } from "@/components/app/page-parts";
import { RangeControl } from "@/components/app/range-picker";
import { formatModelName, ModelLogo } from "@/components/model-logo";
import { resolvePreset } from "@/lib/range";

// The demo reuses the dashboard's real chrome (Toolbar, SearchInput,
// FilterSelect, SortableHead, PaginationFooter, RangeControl…) directly, since
// those are prop-driven. This file only fills the gaps where the real pieces
// are wired to routing (Link) or app context.

/** The real RangeControl bound to local state — fully interactive, but the
 * mock data doesn't refetch, so it's effectively decorative. */
export function DemoRange() {
	const [range, setRange] = useState(() => resolvePreset("24h"));
	return <RangeControl value={range} onChange={setRange} />;
}

/** List-page header — the real RouteHeader minus the range context: same
 * PageHeader, section icon looked up from the shared nav config. */
export function DemoListHeader({
	href,
	title,
	withRange,
	actions,
}: {
	href: Route;
	title: string;
	withRange?: boolean;
	actions?: React.ReactNode;
}) {
	const item = navItem(href);
	const composedActions =
		withRange || actions ? (
			<>
				{actions}
				{withRange && <DemoRange />}
			</>
		) : undefined;
	return (
		<PageHeader
			title={title}
			icon={item?.icon}
			iconClassName={item?.iconClassName}
			actions={composedActions}
		/>
	);
}

// A `[icon] Parent › Title` breadcrumb header for detail views — PageHeader's
// `back` variant with the Link swapped for a button that pops back to the
// list (no routing in the demo).
export function DetailHeader({
	backHref,
	title,
	titleLeading,
	titleTrailing,
	actions,
	onBack,
}: {
	backHref: Route;
	title: string;
	titleLeading?: React.ReactNode;
	titleTrailing?: React.ReactNode;
	actions?: React.ReactNode;
	onBack: () => void;
}) {
	const item = navItem(backHref);
	const BackIcon = item?.icon;
	return (
		<div className="flex flex-wrap items-end justify-between gap-4 px-8 h-8">
			<div className="flex min-w-0 flex-col gap-1.5">
				<h1 className="flex items-center gap-1.5 text-base font-medium tracking-tight">
					<button
						type="button"
						onClick={onBack}
						className="flex shrink-0 cursor-pointer items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
					>
						{BackIcon && (
							<BackIcon
								className={cn("size-4.5 shrink-0", item?.iconClassName)}
							/>
						)}
						{item?.label}
					</button>
					<IconChevronRight className="size-4 shrink-0 text-muted-foreground/50 stroke-[1.5px]" />
					{titleLeading}
					<span className="truncate">{title}</span>
					{titleTrailing}
				</h1>
			</div>
			{actions && (
				// Nudge actions down so they line up with the title text.
				<div className="flex items-center gap-2 translate-y-1">{actions}</div>
			)}
		</div>
	);
}

/** Linked-entity pill on detail pages — the real ContextChip with the Link
 * swapped for an inert button. */
export function DemoContextChip({
	icon: ChipIcon,
	iconClassName,
	label,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	iconClassName?: string;
	label: string;
	onClick?: () => void;
}) {
	return (
		<Button
			variant="outline"
			className="max-w-xs justify-start bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted font-normal transition-[color,box-shadow] active:scale-100 dark:border-0 dark:shadow-(--custom-outline-shadow)"
			onClick={onClick}
		>
			<ChipIcon className={cn("size-3.5 shrink-0", iconClassName)} />
			<span className="truncate">{label}</span>
			<IconArrowUpRight className="size-3.5 shrink-0 -ml-0.5 mt-px text-muted-foreground" />
		</Button>
	);
}

/** The runs drawers' "See session" button — the real `SessionButton` with
 * the demo's in-app navigation instead of a link. */
export function DemoSessionButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			size="sm"
			variant="secondary"
			className={cn("w-fit", DRAWER_BUTTON_CLASS)}
			onClick={onClick}
		>
			<IconMessage2Filled className="text-sky-500" />
			See session
			<IconArrowUpRight className="mt-px" />
		</Button>
	);
}

/** Static context chip for the model(s) a session or trace ran on — the real
 * ModelChip built on DemoContextChip. One model shows its logo and display
 * name; several overlap their logos (capped at three) and read "n models". */
export function DemoModelChip({ models }: { models: string[] }) {
	if (models.length === 0) return null;
	const only = models[0];
	if (models.length === 1 && only) {
		return (
			<DemoContextChip
				icon={(p) => <ModelLogo modelId={only} className={p.className} />}
				iconClassName=""
				label={formatModelName(only)}
			/>
		);
	}
	const shown = models.slice(0, 3);
	return (
		<span title={models.map((m) => formatModelName(m)).join(", ")}>
			<DemoContextChip
				icon={(p) => (
					<span className={cn("flex items-center -space-x-1.5", p.className)}>
						{shown.map((m) => (
							<span
								key={m}
								className="flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-card"
							>
								<ModelLogo modelId={m} className="size-3" />
							</span>
						))}
						{models.length > shown.length && (
							<IconCpu className="size-3 text-muted-foreground" />
						)}
					</span>
				)}
				iconClassName="w-auto"
				label={`${models.length} models`}
			/>
		</span>
	);
}

/** `v3` chip for a run's inferred prompt version — the real PromptVersionChip
 * with its link to the agent page swapped for the demo's in-app navigation. */
export function DemoPromptVersionChip({
	version,
	onClick,
	className,
}: {
	version: { id: string; number: number } | null | undefined;
	onClick?: () => void;
	className?: string;
}) {
	if (!version) return null;
	return (
		<Badge
			variant="sky"
			size="sm"
			className={cn("font-mono normal-case tabular-nums", className)}
			title="Prompt version — see all versions"
			render={<button type="button" onClick={onClick} />}
		>
			{`v${version.number}`}
		</Badge>
	);
}
