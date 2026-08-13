/**
 * Best-effort: a root agent span's `input` is usually a JSON messages array
 * (each call passes the running history), so surface the last user message as
 * the trace's prompt. Falls back to the raw string when it isn't a
 * recognizable messages array — the SDK truncates payloads over 1MB with a
 * trailing `…[truncated]` that breaks JSON.parse, so that path is routine on
 * large traces. Never throws.
 */
export function extractUserMessage(input: string | undefined, capLength: number): string | null {
  if (!input) return null;
  const cap = (s: string) => (s.length > capLength ? `${s.slice(0, capLength)}…` : s);
  try {
    const parsed: unknown = JSON.parse(input);
    if (Array.isArray(parsed)) {
      for (let i = parsed.length - 1; i >= 0; i--) {
        const msg = parsed[i] as { role?: unknown; content?: unknown } | null;
        if (msg && typeof msg === "object" && msg.role === "user") {
          return cap(stringifyContent(msg.content));
        }
      }
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  return cap(input);
}

// AI SDK message content is either a string or an array of parts ({type,text,…}).
function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .filter(Boolean)
      .join("");
    if (text) return text;
  }
  return JSON.stringify(content);
}
