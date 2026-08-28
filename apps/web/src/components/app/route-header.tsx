"use client";

import type { Route } from "next";

import { navItem } from "./nav";
import { PageHeader } from "./page-parts";
import { useRange } from "./range-context";
import { RangeControl } from "./range-picker";

/**
 * RangeControl bound to the shared range context. The context lives in the app
 * shell (above the page boundary), so a picker rendered by a route's
 * loading.tsx is fully live during the suspense window — changing the range
 * while a page streams in carries over to the mounted page.
 */
export function LiveRangePicker() {
	const { range, setRange } = useRange();
	return <RangeControl value={range} onChange={setRange} />;
}

/**
 * Per-route page header rendered by BOTH a route's loading.tsx and its client
 * component, so navigation paints the real header instantly and the
 * fallback → page swap is pixel-identical. Define each route's header once in
 * a header.tsx next to its page.tsx; don't inline titles in two places.
 */
export function RouteHeader({
	href,
	title,
	description,
	back,
	noIcon,
	withRange,
	actions,
}: {
	/** Nav href used to look up the section icon (and the back crumb target). */
	href: Route;
	title: string;
	description?: React.ReactNode;
	/** Render a breadcrumb back to `href` instead of the section icon. */
	back?: boolean;
	/** Skip the section icon (settings/operator pages render a plain title). */
	noIcon?: boolean;
	/** Prepend the live range picker to the actions. */
	withRange?: boolean;
	actions?: React.ReactNode;
}) {
	const item = navItem(href);
	const composedActions =
		withRange || actions ? (
			<>
				{withRange && <LiveRangePicker />}
				{actions}
			</>
		) : undefined;
	if (back) {
		return (
			<PageHeader
				title={title}
				back={item}
				description={description}
				actions={composedActions}
			/>
		);
	}
	return (
		<PageHeader
			title={title}
			icon={noIcon ? undefined : item?.icon}
			iconClassName={noIcon ? undefined : item?.iconClassName}
			description={description}
			actions={composedActions}
		/>
	);
}
