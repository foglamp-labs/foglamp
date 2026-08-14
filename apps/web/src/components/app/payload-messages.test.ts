import { describe, expect, test } from "bun:test";

import { partFrom, toMessages, unchangedPrefix } from "./payload-messages";

// The payloads under test are captured verbatim from the Vercel AI SDK, so the
// shapes here are the real ones the SDK emits — not a normalized schema. The
// database column is an opaque String, which is why the garbage cases matter as
// much as the happy ones: nothing upstream guarantees any of this parses.

describe("toMessages — recognized shapes", () => {
	test("ModelMessage[] with string content", () => {
		const messages = toMessages(
			JSON.stringify([
				{ role: "system", content: "You are helpful." },
				{ role: "user", content: "Hi" },
			]),
		);
		expect(messages).toEqual([
			{ role: "system", parts: [{ kind: "text", text: "You are helpful." }] },
			{ role: "user", parts: [{ kind: "text", text: "Hi" }] },
		]);
	});

	test("ModelMessage[] with content part arrays", () => {
		const messages = toMessages(
			JSON.stringify([
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Looking that up." },
						{ type: "tool-call", toolName: "search", input: { q: "foglamp" } },
					],
				},
			]),
		);
		expect(messages).toEqual([
			{
				role: "assistant",
				parts: [
					{ kind: "text", text: "Looking that up." },
					{ kind: "tool-call", name: "search", data: { q: "foglamp" } },
				],
			},
		]);
	});

	test("bare ContentPart[] becomes one roleless message", () => {
		const messages = toMessages(
			JSON.stringify([
				{ type: "reasoning", text: "thinking" },
				{ type: "text", text: "answer" },
			]),
		);
		expect(messages).toEqual([
			{
				role: null,
				parts: [
					{ kind: "reasoning", text: "thinking" },
					{ kind: "text", text: "answer" },
				],
			},
		]);
	});

	test("a single message object, not wrapped in an array", () => {
		const messages = toMessages(
			JSON.stringify({ role: "user", content: "yo" }),
		);
		expect(messages).toEqual([
			{ role: "user", parts: [{ kind: "text", text: "yo" }] },
		]);
	});

	test("a JSON-encoded string is unwrapped rather than shown with its quotes", () => {
		expect(toMessages(JSON.stringify("plain answer"))).toEqual([
			{ role: null, parts: [{ kind: "text", text: "plain answer" }] },
		]);
	});

	test("a message with no content yields no parts", () => {
		expect(toMessages(JSON.stringify([{ role: "assistant" }]))).toEqual([
			{ role: "assistant", parts: [] },
		]);
	});
});

describe("toMessages — inputs that must not be parsed", () => {
	// Every one of these renders as the raw string instead. `null` is the signal
	// for that, so it is a result, not a failure.
	test.each([
		["plain prose", "Here is the answer."],
		["empty string", ""],
		// serialize() cuts payloads over 1MB and appends a marker, which leaves
		// invalid JSON behind. Real large traces hit this constantly.
		["truncated JSON", '[{"role":"user","content":"aaa…[truncated]'],
		["JSON null", "null"],
		["JSON number", "42"],
		["JSON boolean", "true"],
		["empty array", "[]"],
	])("%s", (_label, value) => {
		expect(toMessages(value)).toBeNull();
	});

	test("an array of non-objects still renders as parts, not as a crash", () => {
		expect(toMessages(JSON.stringify([1, "two", null]))).toEqual([
			{
				role: null,
				parts: [
					{ kind: "json", data: 1 },
					{ kind: "text", text: "two" },
					{ kind: "json", data: null },
				],
			},
		]);
	});
});

describe("partFrom", () => {
	test("tool-call falls back through the SDK's alternate key names", () => {
		expect(partFrom({ type: "tool-call", name: "x", args: { a: 1 } })).toEqual({
			kind: "tool-call",
			name: "x",
			data: { a: 1 },
		});
	});

	test("tool-result", () => {
		expect(
			partFrom({ type: "tool-result", toolName: "search", output: ["hit"] }),
		).toEqual({ kind: "tool-result", name: "search", data: ["hit"] });
	});

	test("tool-error is its own kind, not an unlabeled JSON blob", () => {
		expect(
			partFrom({ type: "tool-error", toolName: "search", error: "429" }),
		).toEqual({ kind: "tool-error", name: "search", data: "429" });
	});

	test("an unnamed tool still gets a label", () => {
		expect(partFrom({ type: "tool-call" })).toEqual({
			kind: "tool-call",
			name: "tool",
			data: {},
		});
	});

	test("reasoning is distinguished from the answer text", () => {
		expect(partFrom({ type: "reasoning", text: "hmm" })).toEqual({
			kind: "reasoning",
			text: "hmm",
		});
	});

	test("file parts drop their bytes and keep only the descriptors", () => {
		expect(
			partFrom({
				type: "file",
				mediaType: "application/pdf",
				filename: "report.pdf",
				data: "JVBERi0xLjQK…",
			}),
		).toEqual({
			kind: "file",
			mediaType: "application/pdf",
			filename: "report.pdf",
		});
	});

	test("an image without descriptors is still a file part", () => {
		expect(
			partFrom({ type: "image", image: "data:image/png;base64,AAA" }),
		).toEqual({ kind: "file", mediaType: null, filename: null });
	});

	test("an unrecognized part type survives as JSON", () => {
		expect(partFrom({ type: "future-part", value: 1 })).toEqual({
			kind: "json",
			data: { type: "future-part", value: 1 },
		});
	});

	test("a text part missing its text is not treated as text", () => {
		expect(partFrom({ type: "text" })).toEqual({
			kind: "json",
			data: { type: "text" },
		});
	});
});

describe("unchangedPrefix — the transcript delta fold", () => {
	const msg = (role: string, text: string) => ({
		role,
		parts: [{ kind: "text" as const, text }],
	});
	const history = [
		msg("system", "You are helpful."),
		msg("user", "Hi"),
		msg("assistant", "Hello!"),
	];

	test("a clean append folds the whole previous input", () => {
		expect(
			unchangedPrefix([...history, msg("user", "Next question")], history),
		).toBe(3);
	});

	test("an edited history returns 0 — the delta must never hide a change", () => {
		const edited = [msg("system", "You are terse."), ...history.slice(1)];
		expect(
			unchangedPrefix([...edited, msg("user", "Next question")], history),
		).toBe(0);
	});

	test("same length is not a delta", () => {
		expect(unchangedPrefix(history, history)).toBe(0);
	});

	test("a shrunk list is not a delta", () => {
		expect(unchangedPrefix(history.slice(0, 2), history)).toBe(0);
	});

	test("an empty previous input is not a delta", () => {
		expect(unchangedPrefix(history, [])).toBe(0);
	});
});
