import { describe, expect, it } from "bun:test";

import { dueWeek, sanitizeSummary } from "./weeklyDigest";

describe("dueWeek", () => {
	it("covers last week once Monday 08:00 UTC has passed", () => {
		const { weekStart, weekEnd } = dueWeek(new Date("2026-08-31T08:00:00Z"))!;
		expect(weekStart.toISOString()).toBe("2026-08-24T00:00:00.000Z");
		expect(weekEnd.toISOString()).toBe("2026-08-31T00:00:00.000Z");
	});
	it("still targets the previous week before Monday 08:00 UTC", () => {
		const { weekStart } = dueWeek(new Date("2026-08-31T07:59:59Z"))!;
		expect(weekStart.toISOString()).toBe("2026-08-17T00:00:00.000Z");
	});
	it("targets last week on any later weekday", () => {
		const { weekStart } = dueWeek(new Date("2026-09-03T15:00:00Z"))!;
		expect(weekStart.toISOString()).toBe("2026-08-24T00:00:00.000Z");
	});
});

describe("sanitizeSummary", () => {
	it("replaces em and en dashes and strips markdown", () => {
		expect(
			sanitizeSummary("Errors **rose** 3x — mostly in checkout – watch it."),
		).toBe("Errors rose 3x, mostly in checkout, watch it.");
	});
});
