/**
 * Chip-shaped placeholders where the eval's definition chips land, so the row
 * doesn't shift when the eval loads. Plain divs, not <Skeleton> — its base
 * corner-squircle squares off rounded-full, and these must read as pills.
 */
export function EvalChipPlaceholders() {
	return (
		<>
			<div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
			<div className="h-8 w-20 animate-pulse rounded-full bg-muted" />
			<div className="h-8 w-28 animate-pulse rounded-full bg-muted" />
		</>
	);
}
