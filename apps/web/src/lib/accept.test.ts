import { describe, expect, test } from "bun:test";

import { negotiateFormat } from "./accept";

describe("negotiateFormat", () => {
	test("no header defaults to html", () => {
		expect(negotiateFormat(null)).toBe("html");
		expect(negotiateFormat("")).toBe("html");
		expect(negotiateFormat("   ")).toBe("html");
	});

	test("plain markdown request gets markdown", () => {
		expect(negotiateFormat("text/markdown")).toBe("markdown");
	});

	test("browser-style header gets html", () => {
		expect(
			negotiateFormat(
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			),
		).toBe("html");
	});

	test("wildcard alone gets html", () => {
		expect(negotiateFormat("*/*")).toBe("html");
	});

	test("q-values are honored: markdown preferred over html", () => {
		expect(negotiateFormat("text/html;q=0.5, text/markdown")).toBe("markdown");
		expect(negotiateFormat("text/markdown;q=0.9, text/html;q=0.3")).toBe(
			"markdown",
		);
	});

	test("q-values are honored: html preferred over markdown", () => {
		expect(negotiateFormat("text/markdown;q=0.2, text/html")).toBe("html");
	});

	test("ties go to html", () => {
		expect(negotiateFormat("text/markdown, text/html")).toBe("html");
	});

	test("specific match beats a range", () => {
		// */* covers html at q=1, but the explicit markdown entry is more
		// specific for markdown while html only matches the wildcard — html
		// still wins the tie at q=1.
		expect(negotiateFormat("text/markdown;q=0.5, */*")).toBe("html");
		// Here html is explicitly downranked below the markdown match.
		expect(negotiateFormat("text/markdown, text/html;q=0.4, */*;q=0.1")).toBe(
			"markdown",
		);
	});

	test("q=0 excludes a type", () => {
		expect(negotiateFormat("text/html;q=0, text/markdown")).toBe("markdown");
	});

	test("unsupported types alone are unacceptable", () => {
		expect(negotiateFormat("application/json")).toBe("unacceptable");
		expect(negotiateFormat("image/png, application/pdf")).toBe("unacceptable");
	});

	test("text/* range covers both, html wins", () => {
		expect(negotiateFormat("text/*")).toBe("html");
	});

	test("malformed header falls back to html", () => {
		expect(negotiateFormat("garbage")).toBe("html");
	});
});
