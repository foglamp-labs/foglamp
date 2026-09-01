"use client";

import { useCallback, useRef, useState } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";

/**
 * Fired when a drag-selection completes. Receives the raw x values (as stored
 * in the data rows, e.g. bucket strings) of the selection's edges, in data
 * order — start is always the earlier row.
 */
export type ZoomSelectHandler = (startX: string, endX: string) => void;

// Recharts passes its internal tooltip state to chart-level mouse handlers;
// we only need the hovered bucket's index out of it. Recharts 3 delivers
// `activeTooltipIndex` as a numeric *string* (its TooltipIndex type) on
// categorical charts, so coerce before validating.
const activeIndexOf = (state: unknown): number | null => {
	if (typeof state !== "object" || state === null) return null;
	const raw = (state as { activeTooltipIndex?: unknown }).activeTooltipIndex;
	const idx = typeof raw === "string" && raw !== "" ? Number(raw) : raw;
	return typeof idx === "number" && Number.isInteger(idx) && idx >= 0
		? idx
		: null;
};

type ZoomDragOptions = {
	/** Rows currently rendered by the chart (post-brush, when one is shown). */
	data: readonly Record<string, unknown>[];
	/** X-axis key — selection edges are reported as this column's values. */
	xDataKey: string | undefined;
	/** Completion callback; the hook is inert when omitted. */
	onZoomSelect: ZoomSelectHandler | undefined;
	/** Disables dragging (e.g. while the chart shows its loading skeleton). */
	disabled?: boolean;
};

/**
 * Drag-to-zoom selection shared by the line/area/bar charts. Wires chart-level
 * mouse handlers that track a horizontal drag across buckets, renders the
 * in-progress selection as a translucent <ReferenceArea />, and reports the
 * selected x range on release. A press that never leaves its starting bucket
 * stays a click — series click-to-select keeps working; after a real zoom,
 * `suppressClickRef` stays set for a tick so the release doesn't also toggle
 * the series selection under the pointer.
 */
export function useZoomDrag({
	data,
	xDataKey,
	onZoomSelect,
	disabled = false,
}: ZoomDragOptions) {
	const [selection, setSelection] = useState<{
		start: number;
		end: number;
	} | null>(null);
	// Mirror of `selection` for the mouseup handler: reading it from a ref keeps
	// the zoom callback *outside* any state updater — calling it from inside one
	// would update ancestor state (the date range) mid-render, which React
	// forbids ("Cannot update a component while rendering a different one").
	const selectionRef = useRef(selection);
	const suppressClickRef = useRef(false);
	const enabled = !!onZoomSelect && !!xDataKey && !disabled;

	const select = useCallback((sel: { start: number; end: number } | null) => {
		selectionRef.current = sel;
		setSelection(sel);
	}, []);

	const onMouseDown = useCallback(
		(state: unknown) => {
			if (!enabled) return;
			const idx = activeIndexOf(state);
			if (idx === null) return;
			select({ start: idx, end: idx });
		},
		[enabled, select],
	);

	const onMouseMove = useCallback(
		(state: unknown) => {
			const sel = selectionRef.current;
			if (!sel) return; // only tracks while a drag is in progress
			const idx = activeIndexOf(state);
			if (idx === null || idx === sel.end) return; // re-render per bucket, not per pixel
			select({ start: sel.start, end: idx });
		},
		[select],
	);

	const onMouseUp = useCallback(() => {
		const sel = selectionRef.current;
		select(null);
		if (!sel || !enabled || !xDataKey) return;
		const lo = Math.min(sel.start, sel.end);
		const hi = Math.max(sel.start, sel.end);
		// A press that stayed in one bucket is a click, not a zoom.
		if (hi - lo < 1) return;
		const startX = data[lo]?.[xDataKey];
		const endX = data[hi]?.[xDataKey];
		if (startX == null || endX == null) return;
		// The browser still fires a click on the element under the pointer
		// after this mouseup; hold the flag through it so the release of a
		// zoom drag can't also toggle a series selection.
		suppressClickRef.current = true;
		setTimeout(() => {
			suppressClickRef.current = false;
		}, 0);
		onZoomSelect?.(String(startX), String(endX));
	}, [data, xDataKey, onZoomSelect, enabled, select]);

	const onMouseLeave = useCallback(() => {
		select(null);
	}, [select]);

	let overlay: React.ReactNode = null;
	if (selection && enabled && xDataKey) {
		const lo = Math.min(selection.start, selection.end);
		const hi = Math.max(selection.start, selection.end);
		const x1 = data[lo]?.[xDataKey];
		const x2 = data[hi]?.[xDataKey];
		if (x1 != null && x2 != null) {
			// A ReferenceArea strokes all four edges of its rect; drawing the
			// fill without a stroke and marking the edges with ReferenceLines
			// keeps only the vertical sides dashed.
			overlay = (
				<>
					<ReferenceArea
						x1={String(x1)}
						x2={String(x2)}
						fill="var(--foreground)"
						fillOpacity={0.06}
						stroke="none"
					/>
					<ReferenceLine
						x={String(x1)}
						stroke="var(--foreground)"
						strokeOpacity={0.25}
						strokeDasharray="2 2"
					/>
					<ReferenceLine
						x={String(x2)}
						stroke="var(--foreground)"
						strokeOpacity={0.25}
						strokeDasharray="2 2"
					/>
				</>
			);
		}
	}

	return {
		enabled,
		overlay,
		suppressClickRef,
		handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave },
	};
}
