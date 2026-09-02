import type { RouterOutputs } from "@/utils/trpc";

export type TraceSpan = RouterOutputs["traces"]["get"]["spans"][number];

/** ClickHouse datetime string ('YYYY-MM-DD HH:MM:SS', UTC) → epoch ms. */
export function toMs(value: string): number {
	return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

/** Order spans depth-first by parent so the waterfall reads top-to-bottom. */
export function orderSpans(
	spans: TraceSpan[],
): { span: TraceSpan; depth: number }[] {
	const children = new Map<string, TraceSpan[]>();
	const roots: TraceSpan[] = [];
	for (const s of spans) {
		if (s.parentSpanId && spans.some((p) => p.spanId === s.parentSpanId)) {
			const list = children.get(s.parentSpanId) ?? [];
			list.push(s);
			children.set(s.parentSpanId, list);
		} else {
			roots.push(s);
		}
	}
	const byStart = (a: TraceSpan, b: TraceSpan) =>
		toMs(a.startTime) - toMs(b.startTime);
	const out: { span: TraceSpan; depth: number }[] = [];
	const walk = (s: TraceSpan, depth: number) => {
		out.push({ span: s, depth });
		(children.get(s.spanId) ?? [])
			.sort(byStart)
			.forEach((c) => walk(c, depth + 1));
	};
	roots.sort(byStart).forEach((r) => walk(r, 0));
	return out;
}

/** Trace-relative window: absolute start (ms) and total span (ms, min 1). */
export function computeWindow(spans: TraceSpan[]): {
	start: number;
	span: number;
} {
	if (spans.length === 0) return { start: 0, span: 1 };
	const start = Math.min(...spans.map((s) => toMs(s.startTime)));
	const end = Math.max(...spans.map((s) => toMs(s.endTime)));
	return { start, span: Math.max(end - start, 1) };
}
