import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import {
	getMarkdownPage,
	markdownNotFound,
	markdownPagePaths,
} from "@/lib/markdown-pages";
import { proxy } from "./proxy";

function req(path: string, headers: Record<string, string> = {}): NextRequest {
	return new NextRequest(`https://foglamp.dev${path}`, { headers });
}

// A NextResponse.next() pass-through carries this marker header instead of a
// real body — that's how we tell "left for Next to render" from "responded".
function isPassThrough(res: Response): boolean {
	return res.headers.get("x-middleware-next") === "1";
}

describe("markdown pages", () => {
	test("every marketing page in the map renders with a title", () => {
		for (const path of markdownPagePaths()) {
			const page = getMarkdownPage(path);
			expect(page).toBeString();
			expect(page).toStartWith("# ");
		}
	});

	test("covers the whole indexable marketing surface (mirrors sitemap.ts)", () => {
		const expected = [
			"/",
			"/pricing",
			"/privacy",
			"/terms",
			"/features/cost-intelligence",
			"/features/evals",
			"/features/alerts",
			"/features/agents",
			"/features/distributed-traces",
			"/features/sdk",
		];
		for (const path of expected) {
			expect(getMarkdownPage(path)).toBeString();
		}
	});

	test("trailing slashes normalize", () => {
		expect(getMarkdownPage("/pricing/")).toBe(getMarkdownPage("/pricing")!);
	});

	test("404 body points at recovery routes", () => {
		const body = markdownNotFound("/nope");
		expect(body).toContain("/llms.txt");
		expect(body).toContain("/sitemap.xml");
		expect(body).toContain("docs.foglamp.dev");
	});
});

describe("proxy content negotiation", () => {
	test("Accept: text/markdown on a marketing page serves markdown", async () => {
		const res = proxy(req("/pricing", { accept: "text/markdown" }));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(res.headers.get("vary")).toBe("Accept");
		expect(await res.text()).toContain("# Foglamp pricing");
	});

	test("browser Accept passes through with Vary: Accept added", () => {
		const res = proxy(
			req("/", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" }),
		);
		expect(isPassThrough(res)).toBe(true);
		expect(res.headers.get("vary")).toContain("Accept");
	});

	test(".md alias serves markdown regardless of Accept", async () => {
		const res = proxy(req("/pricing.md", { accept: "text/html" }));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(await res.text()).toContain("# Foglamp pricing");
	});

	test("unknown .md path is a markdown 404", async () => {
		const res = proxy(req("/nope.md"));
		expect(res.status).toBe(404);
		expect(await res.text()).toContain("404");
	});

	test("markdown-preferring agent on an unknown path gets a markdown 404", async () => {
		const res = proxy(
			req("/some-path-that-does-not-exist", { accept: "text/markdown" }),
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(await res.text()).toContain("/llms.txt");
	});

	test("dashboard routes have no markdown variant and pass through", () => {
		const res = proxy(req("/overview", { accept: "text/markdown" }));
		expect(isPassThrough(res)).toBe(true);
	});

	test("RSC/router requests are left completely alone", () => {
		const res = proxy(req("/pricing", { accept: "*/*", rsc: "1" }));
		expect(isPassThrough(res)).toBe(true);
		expect(res.headers.get("vary")).toBeNull();
	});

	test("unsupported Accept on a negotiated page gets a 406", () => {
		const res = proxy(req("/pricing", { accept: "application/json" }));
		expect(res.status).toBe(406);
		expect(res.headers.get("vary")).toBe("Accept");
	});

	test("q-values flip the winner", async () => {
		const res = proxy(
			req("/", { accept: "text/html;q=0.4, text/markdown" }),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
	});
});
