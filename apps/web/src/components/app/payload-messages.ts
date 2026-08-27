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
	// An array of plain data objects (no `type` discriminator anywhere — e.g. a
	// tool returning a list of records) is one payload, not a part list:
	// per-item partFrom would render every element as its own JSON block.
	if (
		items.every((i) => i && typeof i === "object" && !("type" in (i as object)))
	) {
		return [{ role: null, parts: [{ kind: "json", data: parsed }] }];
	}
	// A bare array of parts (typical for assistant output) → one roleless block.
	return [{ role: null, parts: items.map(partFrom) }];
}

const ROLE_LINE = /^(user|assistant|system|tool): ?/;
const TOOL_LINE = /^\[tool-(call|result) ([^\]\s]+)\] ?(.*)$/;

/** Reverse the judge's flattening of a message payload: `buildContext`
 * renders `[{role, content}]` as `role: text` blocks separated by blank lines,
 * with tool parts as `[tool-call name] {json}` lines. Parsing that back gives
 * the same turns the transcript renderer shows for the raw trace, while still
 * being exactly the text the judge read. Returns null when no role prefix is
 * found (a plain answer or prose payload). */
export function fromHumanized(value: string): Message[] | null {
	const out: Message[] = [];
	let cur: Message | null = null;
	let text: string[] = [];
	const flush = () => {
		if (!cur) return;
		const t = text.join("\n").trim();
		if (t) cur.parts.push({ kind: "text", text: t });
		text = [];
	};
	for (const rawLine of value.split("\n")) {
		let line = rawLine;
		const role = ROLE_LINE.exec(line);
		if (role) {
			flush();
			cur = { role: role[1] ?? null, parts: [] };
			out.push(cur);
			line = line.slice(role[0].length);
		}
		const tool = TOOL_LINE.exec(line);
		if (tool && cur) {
			flush();
			let data: unknown = tool[3];
			try {
				data = JSON.parse(tool[3] ?? "");
			} catch {}
			cur.parts.push({
				kind: tool[1] === "call" ? "tool-call" : "tool-result",
				name: tool[2] ?? "tool",
				data,
			});
			continue;
		}
		if (cur) text.push(line);
	}
	flush();
	return out.length > 0 ? out : null;
}

/** How many leading messages of `current` are carried over unchanged from
 * `previous` — the fold point for the transcript's "N earlier messages" delta.
 * Non-zero only when `previous` is an exact message-prefix of `current` (agent
 * inputs grow by appending); an edited history or a shrunk list returns 0, so
 * the delta view never hides a message that actually changed. */
export function unchangedPrefix(
	current: Message[],
	previous: Message[],
): number {
	if (previous.length === 0 || current.length <= previous.length) return 0;
	for (let i = 0; i < previous.length; i++) {
		if (JSON.stringify(previous[i]) !== JSON.stringify(current[i])) return 0;
	}
	return previous.length;
}
