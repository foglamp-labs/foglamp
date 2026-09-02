export type NegotiatedFormat = "html" | "markdown" | "unacceptable";

type Entry = { type: string; subtype: string; q: number };

function parseAccept(header: string): Entry[] {
	const entries: Entry[] = [];
	for (const part of header.split(",")) {
		const [range, ...params] = part.trim().split(";");
		if (!range) continue;
		const [type, subtype] = range.trim().toLowerCase().split("/");
		if (!type || !subtype) continue;
		let q = 1;
		for (const param of params) {
			const [key, value] = param.trim().split("=");
			if (key?.trim() === "q" && value !== undefined) {
				const parsed = Number.parseFloat(value);
				if (!Number.isNaN(parsed)) q = Math.min(1, Math.max(0, parsed));
			}
		}
		entries.push({ type, subtype, q });
	}
	return entries;
}

// Quality for a concrete media type: the q of the most specific matching
// entry (exact beats text/* beats */*). Undefined when nothing matches.
function quality(
	entries: Entry[],
	type: string,
	subtype: string,
): number | undefined {
	let best: { specificity: number; q: number } | undefined;
	for (const e of entries) {
		let specificity: number;
		if (e.type === type && e.subtype === subtype) specificity = 2;
		else if (e.type === type && e.subtype === "*") specificity = 1;
		else if (e.type === "*" && e.subtype === "*") specificity = 0;
		else continue;
		if (!best || specificity > best.specificity) best = { specificity, q: e.q };
	}
	return best?.q;
}

/**
 * Pick the representation for a request. No/empty/malformed Accept header
 * falls back to HTML (browsers always send one; lenient beats a 406 for
 * sloppy agents). Markdown wins only when the client q-prefers it strictly
 * over HTML — ties go to HTML, matching what browsers expect.
 */
export function negotiateFormat(header: string | null): NegotiatedFormat {
	if (!header || !header.trim()) return "html";
	const entries = parseAccept(header);
	if (entries.length === 0) return "html";

	const html = quality(entries, "text", "html") ?? 0;
	const markdown = quality(entries, "text", "markdown") ?? 0;

	if (markdown > 0 && markdown > html) return "markdown";
	if (html > 0) return "html";
	// Neither acceptable: anything with a positive */* or text/* was already
	// counted above, so this Accept header genuinely excludes both.
	return "unacceptable";
}
