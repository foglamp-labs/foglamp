"use client";

import * as React from "react";

import { cn } from "@foglamp/ui/lib/utils";

type TableContextValue = {
	stickyHeader: boolean;
};

const TableContext = React.createContext<TableContextValue>({
	stickyHeader: false,
});

const alignClass = {
	left: "text-left",
	center: "text-center",
	right: "text-right tabular-nums",
} as const;

type Align = keyof typeof alignClass;

function Table({
	className,
	maxHeight,
	stickyHeader,
	...props
}: React.ComponentProps<"table"> & {
	/** Cap the table height so the body scrolls internally (enables a sticky header). */
	maxHeight?: number | string;
	/** Pin the header while the body scrolls. Auto-enabled when `maxHeight` is set. */
	stickyHeader?: boolean;
}) {
	const scrollable = maxHeight != null;
	const sticky = stickyHeader ?? scrollable;
	return (
		<TableContext.Provider value={{ stickyHeader: sticky }}>
			<div
				data-slot="table-container"
				className={cn(
					"relative w-full overflow-x-auto",
					scrollable && "overflow-y-auto",
				)}
				style={scrollable ? { maxHeight } : undefined}
			>
				<table
					data-slot="table"
					className={cn(
						"w-full caption-bottom text-sm",
						// Extra right padding on the last column pulls its content in from
						// the screen edge so right-aligned values are easier to scan.
						// Applied here (not on TableHead/TableCell) so it wins over their
						// px-8 and covers any cell component in the last slot.
						"[&_th:last-child]:pr-10 [&_td:last-child]:pr-10",
						className,
					)}
					{...props}
				/>
			</div>
		</TableContext.Provider>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	const { stickyHeader } = React.useContext(TableContext);
	return (
		<thead
			data-slot="table-header"
			className={cn(
				// Height on the row too: Safari doesn't propagate a thead height down
				// to its tr the way Chromium does.
				"h-13 [&_tr]:h-13",
				// When sticky, use a near-solid blurred bg so scrolling rows don't bleed through.
				stickyHeader &&
					"sticky top-0 z-10 bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/75",
				className,
			)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				"border-t dark:border-[#1E1E1E] border-[#EBEBEB] bg-muted/50 font-medium [&>tr]:last:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({
	className,
	interactive,
	onClick,
	onKeyDown,
	tabIndex,
	...props
}: React.ComponentProps<"tr"> & {
	/** Clickable row: adds hover/pointer, a focus ring, and Enter/Space activation. */
	interactive?: boolean;
}) {
	// Mirror a click on Enter/Space so interactive rows are keyboard-operable.
	const handleKeyDown =
		interactive && onClick
			? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
					onKeyDown?.(e);
					if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						e.currentTarget.click();
					}
				}
			: onKeyDown;

	return (
		<tr
			data-slot="table-row"
			data-interactive={interactive || undefined}
			tabIndex={interactive ? (tabIndex ?? 0) : tabIndex}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			className={cn(
				"[&_th:last-child]:border-0 border-b dark:border-border/40 border-border/50 data-[state=selected]:bg-muted has-aria-expanded:bg-muted/50",
				"data-interactive:cursor-pointer data-interactive:hover:[&>td]:border-neutral-200  data-interactive:dark:hover:[&>td]:border-neutral-800 data-interactive:hover:bg-muted data-interactive:outline-none data-interactive:focus-visible:bg-muted/50 data-interactive:focus-visible:ring-[1.5px] data-interactive:focus-visible:ring-inset data-interactive:focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	align,
	...props
}: Omit<React.ComponentProps<"th">, "align"> & { align?: Align }) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"text-left align-middle font-medium whitespace-nowrap has-[[role=checkbox]]:pr-0 px-8",
				// Vertical column dividers (none on the leftmost cell). More prominent
				// than the body cells to emphasize the header.
				// "border-l border-neutral-200 first:border-l-0 dark:border-neutral-800 [&_tr]:border-b",
				align && alignClass[align],
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({
	className,
	align,
	...props
}: Omit<React.ComponentProps<"td">, "align"> & { align?: Align }) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 py-2 px-8",
				// Vertical column dividers (none on the leftmost cell).
				// "border-l border-[#EBEBEB] first:border-l-0 dark:border-[#1E1E1E]",
				align && alignClass[align],
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn(
				"py-2 text-sm text-muted-foreground bg-muted/50 border-t dark:border-[#2A2A2A] border-[#EBEBEB]",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
};
