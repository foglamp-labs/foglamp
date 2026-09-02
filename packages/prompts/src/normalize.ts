import { createHash } from "node:crypto";

// System prompts are rarely static strings: they interpolate the current date,
// a user id, a session token, a URL. Hashing the raw text would give every run
// its own "version". Normalization strips the values that vary per run while
// keeping the wording, so runs on the same template share a hash. Template
// inference (see ./infer) then reconciles the remaining variation (user names,
// injected documents) into versions with slots.
//
// The hash is computed at ingest and stored on the root span, so changing
// these rules only affects new rows — old hashes stay comparable to each other
// but not to new ones. Keep the rules conservative and append-only.

export const PROMPT_HASH_CHARS = 32;

const RULES: Array<[RegExp, string]> = [
  // ISO date-times and dates: 2026-09-02T10:11:12.345Z, 2026-09-02 10:11, 2026-09-02
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, "{date}"],
  // Long-form dates: September 2, 2026 / 2 September 2026 / Sep 2 2026
  [
    /\b(?:(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?,?\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/gi,
    "{date}",
  ],
  // Clock times: 10:11, 10:11:12, 3:05 pm
  [/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\b/gi, "{time}"],
  // UUIDs
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "{id}"],
  // Emails
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "{email}"],
  // URLs
  [/\bhttps?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi, "{url}"],
  // Hex / base64-ish identifiers and tokens of 16+ chars (api keys, hashes, ids)
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{16,}\b/g, "{id}"],
  [/\b[0-9a-f]{16,}\b/gi, "{id}"],
  // Standalone numbers (counts, prices, ages) — not those already inside a placeholder
  [/(?<![\w{])[-+]?\d[\d,]*(?:\.\d+)?%?(?![\w}])/g, "{n}"],
];

/**
 * Normalize a system prompt for hashing: trim, collapse whitespace runs, and
 * replace run-varying values (dates, times, ids, emails, URLs, numbers) with
 * typed placeholders. Pure and deterministic.
 */
export function normalizePrompt(text: string): string {
  let out = text.replace(/\r\n?/g, "\n");
  for (const [re, replacement] of RULES) out = out.replace(re, replacement);
  // Collapse horizontal whitespace, then blank-line runs, so reflowed prompts
  // (a template re-indented in code) still hash the same.
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

/** Stable identity of a prompt's wording: sha256 of the normalized text, first 32 hex chars. */
export function promptHash(text: string): string {
  const normalized = normalizePrompt(text);
  if (normalized.length === 0) return "";
  return createHash("sha256").update(normalized).digest("hex").slice(0, PROMPT_HASH_CHARS);
}
