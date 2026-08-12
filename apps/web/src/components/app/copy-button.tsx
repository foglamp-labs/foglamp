"use client";

import { cn } from "@foglamp/ui/lib/utils";

import { CopyIcon } from "@/components/app/copy-icon";
import { useCopied } from "@/components/app/use-copied";

/** Copy a value to the clipboard with a brief check-mark confirmation.
 *
 * - `stopPropagation` — call `e.stopPropagation()` on click; use when the
 *   button sits inside a clickable table row or card.
 * - `iconSize` — Tailwind size class applied to both icons (default `"size-4"`).
 * - `className` — additional classes for the `<button>` element. */
export function CopyButton({
	value,
	title,
	stopPropagation,
	iconSize = "size-4",
	className,
}: {
	value: string;
	title: string;
	stopPropagation?: boolean;
	iconSize?: string;
	className?: string;
}) {
	const { copied, markCopied } = useCopied();
	return (
		<button
			type="button"
			title={title}
			onClick={(e) => {
				if (stopPropagation) e.stopPropagation();
				void navigator.clipboard.writeText(value);
				markCopied();
			}}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/60 cursor-pointer transition-colors hover:text-foreground",
				className,
			)}
		>
			<CopyIcon
				copied={copied}
				className={iconSize}
				checkClassName={cn(iconSize)}
			/>
		</button>
	);
}
