import type { MetadataInput } from "./types";
import type { Metadata } from "./wire";

// Safe, bounded serialization. Telemetry must never throw into the host app and
// must never balloon a request, so every blob is JSON-encoded defensively and
// hard-capped in length.

const TRUNCATION_MARKER = "…[truncated]";

/**
 * JSON-encode an arbitrary value to a length-capped string, or `undefined` if
 * it is empty or cannot be encoded. Strings pass through (still capped).
 * Never throws.
 */
export function serialize(value: unknown, maxChars: number): string | undefined {
  if (value === undefined || value === null) return undefined;

  let out: string | undefined;
  if (typeof value === "string") {
    out = value;
  } else {
    try {
      out = JSON.stringify(value, jsonReplacer);
    } catch {
      // Circular references, throwing getters, etc. — drop rather than throw.
      return undefined;
    }
  }
  if (out === undefined || out.length === 0) return undefined;

  if (out.length > maxChars) {
    return out.slice(0, Math.max(0, maxChars - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
  }
  return out;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return undefined;
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

/** Coerce a user metadata map to the wire contract's string→string shape. */
export function coerceMetadata(input: MetadataInput | undefined): Metadata | undefined {
  if (!input) return undefined;
  const out: Metadata = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
