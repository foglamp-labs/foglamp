import { serialize, toolParams } from "./serialize";
import type { Metadata } from "./wire";

// System-prompt + "free metadata" extraction shared by both collectors (v7
// telemetry and the wrap adapter). Everything here is best-effort and never
// throws: a shape we don't recognize just yields `undefined`.

// Mirrors the wire contract's per-value metadata cap (see coerceMetadata).
const METADATA_VALUE_CHARS = 1024;

/**
 * Flatten an AI SDK `Instructions` value (v7: `string | SystemModelMessage |
 * SystemModelMessage[]`; v4-v6 `system: string`) to plain text. Multiple
 * system messages are joined with a blank line. Returns `undefined` when there
 * is no textual content.
 */
export function instructionsText(instructions: unknown): string | undefined {
  if (instructions == null) return undefined;
  if (typeof instructions === "string") return instructions.length > 0 ? instructions : undefined;
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const parts: string[] = [];
  for (const item of list) {
    const text = messageText(item);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * The system prompt carried inside a `messages` array: the text of the leading
 * `role: "system"` messages (older SDK versions and hand-built message lists
 * put the system prompt there instead of `system`/`instructions`).
 */
export function leadingSystemText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  const parts: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || (m as { role?: unknown }).role !== "system") break;
    const text = messageText(m);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function messageText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.length > 0 ? content : undefined;
  if (Array.isArray(content)) {
    const texts = content
      .map((part) =>
        part && typeof part === "object" && (part as { type?: unknown }).type === "text"
          ? (part as { text?: unknown }).text
          : undefined,
      )
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    return texts.length > 0 ? texts.join("\n") : undefined;
  }
  return undefined;
}

// Generation settings worth keeping next to a call. Read from the user's call
// args (wrap) or the v7 start event; only scalars/short lists are recorded.
const SETTING_KEYS = [
  "temperature",
  "maxOutputTokens",
  "maxTokens",
  "topP",
  "topK",
  "presencePenalty",
  "frequencyPenalty",
  "seed",
  "stopSequences",
  "maxRetries",
] as const;

/**
 * Generation settings as string metadata (`temperature`, `maxOutputTokens`,
 * `topP`, ...). Absent settings are skipped, so the map is empty for a call
 * that relies on provider defaults. v4/v5 `maxTokens` is folded into
 * `maxOutputTokens`.
 */
export function settingsMetadata(source: unknown): Metadata {
  const out: Metadata = {};
  if (!source || typeof source !== "object") return out;
  const src = source as Record<string, unknown>;
  for (const key of SETTING_KEYS) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    const name = key === "maxTokens" ? "maxOutputTokens" : key;
    if (name in out) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[name] = String(value);
    else if (typeof value === "string" && value.length > 0) out[name] = clamp(value);
    else if (Array.isArray(value)) {
      const s = serialize(value, METADATA_VALUE_CHARS);
      if (s) out[name] = s;
    }
  }
  return out;
}

/**
 * The structured-output schema (generateObject/streamObject `schema`, or the
 * v6/v7 `Output.object({ schema })` spec) as a JSON-Schema string, capped to
 * the metadata value limit. Zod schemas are converted via the AI SDK when it
 * exposes `asSchema`; lazy schemas are skipped.
 */
export function outputSchemaJson(schema: unknown): string | undefined {
  const js = toolParams(schema);
  if (js === undefined) return undefined;
  return serialize(js, METADATA_VALUE_CHARS);
}

/**
 * Provider call warnings (`step.warnings` — unsupported settings, dropped
 * features, ...) as a compact JSON string, or `undefined` when there are none.
 */
export function warningsJson(warnings: unknown): string | undefined {
  if (!Array.isArray(warnings) || warnings.length === 0) return undefined;
  const compact = warnings.slice(0, 20).map((w) => {
    if (!w || typeof w !== "object") return String(w);
    const r = w as Record<string, unknown>;
    const entry: Record<string, unknown> = {};
    for (const k of ["type", "feature", "setting", "details", "message"]) {
      if (typeof r[k] === "string") entry[k] = r[k];
    }
    return Object.keys(entry).length > 0 ? entry : r;
  });
  return serialize(compact, METADATA_VALUE_CHARS);
}

/**
 * Per-step "free" signals: the model id the provider actually served (which
 * can differ from the requested id — aliases, silent upgrades) and any call
 * warnings. Empty when neither is present.
 */
export function stepExtras(step: unknown, requestedModelId: string | undefined): Metadata {
  const out: Metadata = {};
  if (!step || typeof step !== "object") return out;
  const s = step as { response?: { modelId?: unknown }; warnings?: unknown };
  const served = s.response?.modelId;
  if (typeof served === "string" && served.length > 0 && served !== requestedModelId) {
    out.servedModelId = clamp(served);
  }
  const warnings = warningsJson(s.warnings);
  if (warnings) out.warnings = warnings;
  return out;
}

function clamp(value: string): string {
  return value.length > METADATA_VALUE_CHARS ? value.slice(0, METADATA_VALUE_CHARS) : value;
}
