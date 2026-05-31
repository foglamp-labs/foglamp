import type { ExtractedContext, ScoreResult } from "./types";

// Deterministic, free scorers keyed by preset id. Each takes the extracted
// fields + the eval's params and returns a pass/fail verdict. Pure functions —
// no I/O — so they're cheap to run inline in the worker and easy to unit test.

type CodeScorer = (
  extracted: ExtractedContext,
  params: Record<string, unknown>,
) => ScoreResult;

const pass = (reason: string): ScoreResult => ({ score: null, passed: true, reason });
const fail = (reason: string): ScoreResult => ({ score: null, passed: false, reason });

const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ["phone", /(?:\+?\d[\d ().-]{7,}\d)/],
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/],
  ["credit_card", /\b(?:\d[ -]?){13,16}\b/],
  ["ip", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
];

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["openai_key", /\bsk-[A-Za-z0-9]{16,}\b/],
  ["aws_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["google_key", /\bAIza[0-9A-Za-z_-]{20,}\b/],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

function str(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

export const CODE_SCORERS: Record<string, CodeScorer> = {
  pii: ({ output }) => {
    const hits = PII_PATTERNS.filter(([, re]) => re.test(output)).map(([k]) => k);
    return hits.length ? fail(`Found PII: ${hits.join(", ")}`) : pass("No PII detected");
  },
  secret_leak: ({ output }) => {
    const hits = SECRET_PATTERNS.filter(([, re]) => re.test(output)).map(([k]) => k);
    return hits.length ? fail(`Found secrets: ${hits.join(", ")}`) : pass("No secrets detected");
  },
  valid_json: ({ output }) => {
    try {
      JSON.parse(output);
      return pass("Valid JSON");
    } catch {
      return fail("Output is not valid JSON");
    }
  },
  no_refusal: ({ output }) => {
    const refusal =
      /\b(i('?m| am) (sorry|unable|not able)|i can(?:'|no)?t (help|assist|provide)|as an ai\b|i cannot comply)/i.test(
        output,
      );
    return refusal ? fail("Output looks like a refusal") : pass("Not a refusal");
  },
  not_empty: ({ output }) =>
    output.trim().length > 0 ? pass("Non-empty") : fail("Output is empty"),
  max_length: ({ output }, params) => {
    const max = typeof params.maxChars === "number" ? params.maxChars : 4000;
    return output.length <= max
      ? pass(`${output.length} ≤ ${max} chars`)
      : fail(`${output.length} > ${max} chars`);
  },
  contains: ({ output }, params) => {
    const sub = str(params, "substring");
    return sub && output.includes(sub)
      ? pass(`Contains "${sub}"`)
      : fail(`Missing "${sub}"`);
  },
  not_contains: ({ output }, params) => {
    const sub = str(params, "substring");
    return sub && output.includes(sub)
      ? fail(`Contains banned "${sub}"`)
      : pass(`Excludes "${sub}"`);
  },
  regex_match: ({ output }, params) => {
    const pattern = str(params, "pattern") || ".*";
    try {
      return new RegExp(pattern).test(output)
        ? pass(`Matches /${pattern}/`)
        : fail(`No match for /${pattern}/`);
    } catch {
      return fail(`Invalid regex: ${pattern}`);
    }
  },
  tool_args_valid: ({ input }) => {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? pass("Tool args are a valid JSON object")
        : fail("Tool args are not a JSON object");
    } catch {
      return fail("Tool args are not valid JSON");
    }
  },
};

export function runCodeScorer(
  presetId: string,
  extracted: ExtractedContext,
  params: Record<string, unknown>,
): ScoreResult {
  const scorer = CODE_SCORERS[presetId];
  if (!scorer) return fail(`Unknown code scorer: ${presetId}`);
  return scorer(extracted, params);
}
