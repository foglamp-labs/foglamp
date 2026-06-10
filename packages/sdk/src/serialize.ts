import { asSchema } from "ai";

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

// Cap on the number of tools serialized into one catalog (defensive against a
// pathologically large tool set); the whole blob is still length-capped below.
const TOOL_CATALOG_MAX_TOOLS = 200;

/**
 * Serialize an AI-SDK tools record to a compact JSON catalog string —
 * `{ [name]: { description?, parameters? } }` — length-capped via `serialize`.
 * `parameters` is the tool's input JSON Schema when synchronously available;
 * lazy/promise schemas (and Zod schemas under an older `ai` without `asSchema`)
 * are omitted to keep this synchronous. Returns `undefined` when there are no
 * tools. Never throws — telemetry must not break the host app.
 */
export function toolCatalogJson(tools: unknown, maxChars: number): string | undefined {
  if (!tools || typeof tools !== "object") return undefined;
  const catalog: Record<string, { description?: string; parameters?: unknown }> = {};
  let count = 0;
  for (const [name, value] of Object.entries(tools as Record<string, unknown>)) {
    if (count >= TOOL_CATALOG_MAX_TOOLS) break;
    if (!value || typeof value !== "object") continue;
    const tool = value as { description?: unknown; inputSchema?: unknown; parameters?: unknown };
    const entry: { description?: string; parameters?: unknown } = {};
    if (typeof tool.description === "string") entry.description = tool.description;
    const params = toolParams(tool.inputSchema ?? tool.parameters);
    if (params !== undefined) entry.parameters = params;
    // Record the tool even when bare, so the catalog reflects availability.
    catalog[name] = entry;
    count++;
  }
  if (Object.keys(catalog).length === 0) return undefined;
  return serialize(catalog, maxChars);
}

// Best-effort JSON Schema for a tool's input. Handles the v7 `inputSchema` and
// v4/v5 `parameters` shapes (Zod or JSON), converting via the AI SDK's
// `asSchema` when present; falls back to a pass-through for plain JSON schemas.
function toolParams(schema: unknown): unknown {
  if (schema == null || (typeof schema !== "object" && typeof schema !== "function")) {
    return undefined;
  }
  try {
    if (typeof asSchema !== "function") {
      const s = schema as Record<string, unknown>;
      return "type" in s || "properties" in s ? s : undefined;
    }
    const js = (asSchema as (s: unknown) => { jsonSchema?: unknown })(schema as never).jsonSchema;
    // `.jsonSchema` may be a PromiseLike for lazy schemas — omit rather than await.
    if (js && typeof (js as { then?: unknown }).then === "function") return undefined;
    return js;
  } catch {
    return undefined;
  }
}

// Mirror the wire contract's metadata limits so an oversized map is clamped
// here instead of getting the whole trace rejected at ingest.
const METADATA_MAX_ENTRIES = 64;
const METADATA_MAX_KEY_CHARS = 128;
const METADATA_MAX_VALUE_CHARS = 1024;

/**
 * Coerce a user metadata map to the wire contract's string→string shape,
 * clamped to the contract limits (64 entries, 128-char keys, 1024-char values).
 */
export function coerceMetadata(input: MetadataInput | undefined): Metadata | undefined {
  if (!input) return undefined;
  const out: Metadata = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (count >= METADATA_MAX_ENTRIES) break;
    const str = typeof value === "string" ? value : String(value);
    out[key.slice(0, METADATA_MAX_KEY_CHARS)] = str.slice(0, METADATA_MAX_VALUE_CHARS);
    count++;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
