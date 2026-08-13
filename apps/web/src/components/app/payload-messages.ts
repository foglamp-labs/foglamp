// Normalizes a span/trace input or output payload into messages → parts, so the
// UI can render a conversation instead of a wall of JSON.
//
// These payloads are Vercel AI SDK v7 shapes captured verbatim by the foglamp
// SDK (not OpenTelemetry GenAI conventions): an array of `{role, content}`
// messages, a bare array of content parts, or a plain (markdown) string. The
// database stores them as opaque strings, so nothing here can assume a schema —
// every unrecognized shape has to survive as JSON rather than throw. In
// particular, payloads over 1MB are stored truncated with a `…[truncated]`
// suffix, which means `JSON.parse` failing is a routine path on real traces,
// not an edge case.

export type Part =
	| { kind: "text"; text: string }
	/** Model thinking — same payload as text, but never the answer. */
	| { kind: "reasoning"; text: string }
	| { kind: "tool-call"; name: string; data: unknown }
	| { kind: "tool-result"; name: string; data: unknown }
	| { kind: "tool-error"; name: string; data: unknown }
	/** Binary attachment. The bytes are deliberately dropped — a base64 blob is
	 * never worth rendering, and inlining one wrecks the panel. */
	| { kind: "file"; mediaType: string | null; filename: string | null }
	| { kind: "json"; data: unknown };

export type Message = { role: string | null; parts: Part[] };

function asString(v: unknown): string | null {
	return typeof v === "string" ? v : null;
}

export function partFrom(p: unknown): Part {
	if (typeof p === "string") return { kind: "text", text: p };
	if (p && typeof p === "object") {
		const o = p as Record<string, unknown>;
		if (o.type === "text" && typeof o.text === "string") {
			return { kind: "text", text: o.text };
		}
		if (o.type === "reasoning" && typeof o.text === "string") {
			return { kind: "reasoning", text: o.text };
		}
		if (o.type === "tool-call") {
			return {
				kind: "tool-call",
				name: String(o.toolName ?? o.name ?? "tool"),
				data: o.input ?? o.args ?? {},
			};
		}
		if (o.type === "tool-result") {
			return {
				kind: "tool-result",
				name: String(o.toolName ?? o.name ?? "tool"),
				data: o.output ?? o.result ?? {},
			};
		}
		if (o.type === "tool-error") {
			return {
				kind: "tool-error",
				name: String(o.toolName ?? o.name ?? "tool"),
				data: o.error ?? o.output ?? o.result ?? {},
			};
		}
		if (o.type === "file" || o.type === "image") {
			return {
				kind: "file",
				mediaType: asString(o.mediaType) ?? asString(o.mimeType),
				filename: asString(o.filename) ?? asString(o.name),
			};
		}
	}
	return { kind: "json", data: p };
}

export function partsFrom(content: unknown): Part[] {
	if (typeof content === "string") return [{ kind: "text", text: content }];
	if (Array.isArray(content)) return content.map(partFrom);
	if (content == null) return [];
	return [partFrom(content)];
}

/** Normalize a payload string to a list of messages, or null when it isn't JSON
 * (e.g. a plain markdown answer, or a payload truncated at the 1MB cap — the
 * caller renders the raw string). */
export function toMessages(value: string): Message[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	// A JSON-encoded string is just prose that went through JSON.stringify —
	// unwrap it rather than showing the reader its quotes and escapes.
	if (typeof parsed === "string") {
		return [{ role: null, parts: [{ kind: "text", text: parsed }] }];
	}
	// Any other scalar carries no more structure than the raw string does, and
	// wrapping it in a message block only adds chrome around it.
	if (parsed === null || typeof parsed !== "object") return null;
	const items = Array.isArray(parsed) ? parsed : [parsed];
	if (items.length === 0) return null;
	const hasRoles = items.some(
		(m) => m && typeof m === "object" && "role" in (m as object),
	);
	if (hasRoles) {
		return items.map((m) => {
			const o = (m ?? {}) as Record<string, unknown>;
			return {
				role: typeof o.role === "string" ? o.role : null,
				parts: partsFrom(o.content),
			};
		});
	}
	// A bare array of parts (typical for assistant output) → one roleless block.
	return [{ role: null, parts: items.map(partFrom) }];
}
