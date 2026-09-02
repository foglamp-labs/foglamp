import { runJudge } from "../src/evals/judge";
import { getPreset } from "../src/evals/presets";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY (a real Anthropic key) and re-run.");
  process.exit(1);
}

// "helpfulness" emits a numeric score + reason — a good check that both the
// score and reason fields come back through the schema.
const preset = getPreset("helpfulness");
if (!preset) throw new Error("preset 'helpfulness' not found");

const modelId = "claude-haiku-4-5";
console.log(`Calling ${modelId} via @ai-sdk/anthropic (generateObject)…\n`);

const outcome = await runJudge({
  provider: "anthropic",
  apiKey,
  modelId,
  preset,
  extracted: {
    input: "How do I reverse a list in Python?",
    output:
      "Use the built-in reversed() for an iterator, slice with [::-1] for a new " +
      "reversed list, or call list.reverse() to reverse it in place.",
  },
});

console.log("result:", JSON.stringify(outcome.result, null, 2));
console.log("cost: ", outcome.cost ?? "(unpriced — OpenRouter table had no match)");

// The judge MUST return structured output: a numeric score (1–5) and a reason.
const { score, reason } = outcome.result;
if (score == null || Number.isNaN(score) || score < 1 || score > 5) {
  console.error(`\n❌ FAIL: expected a numeric score in [1,5], got ${score}`);
  process.exit(1);
}
if (!reason) {
  console.error("\n❌ FAIL: expected a non-empty reason");
  process.exit(1);
}

console.log(
  "\n✅ PASS — Anthropic judge returned valid structured output. " +
    "generateObject works through this SDK pairing end-to-end.",
);
