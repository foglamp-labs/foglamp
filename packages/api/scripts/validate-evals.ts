// Standalone check for the evals scoring engine's pure pieces — encryption,
// code scorers, context extraction (incl. RAG sibling-context), and the judge
// schema/prompt/parse helpers. No live model, no DB. Run with the required env
// vars set (see the package.json script / invocation in the plan).
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { runCodeScorer } from "../src/evals/codeScorers";
import { buildContext } from "../src/evals/context";
import {
  buildJudgeSchema,
  parseJudgeObject,
  renderPrompt,
} from "../src/evals/judge";
import { getPreset } from "../src/evals/presets";
import type { ScoringTarget } from "../src/evals/types";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// --- Encryption round-trip + tamper detection ------------------------------
console.log("crypto (AES-256-GCM):");
const enc = encryptSecret("sk-super-secret-key-value");
assert(decryptSecret(enc) === "sk-super-secret-key-value", "encrypt → decrypt round-trips");
assert(enc.ciphertext !== "sk-super-secret-key-value", "ciphertext is not plaintext");
let tampered = false;
try {
  decryptSecret({ ...enc, authTag: Buffer.from("0".repeat(16)).toString("base64") });
} catch {
  tampered = true;
}
assert(tampered, "tampered auth tag is rejected");

// --- Code scorers ----------------------------------------------------------
console.log("code scorers:");
const ctx = (output: string, input = "") => ({ input, output });
assert(runCodeScorer("pii", ctx("email me at a@b.com"), {}).passed === false, "pii flags email");
assert(runCodeScorer("pii", ctx("nothing here"), {}).passed === true, "pii passes clean text");
assert(runCodeScorer("valid_json", ctx('{"a":1}'), {}).passed === true, "valid_json accepts JSON");
assert(runCodeScorer("valid_json", ctx("not json"), {}).passed === false, "valid_json rejects non-JSON");
assert(runCodeScorer("no_refusal", ctx("I can't help with that"), {}).passed === false, "no_refusal flags refusal");
assert(runCodeScorer("secret_leak", ctx("key sk-ABCDEFGHIJKLMNOPQRST"), {}).passed === false, "secret_leak flags token");
assert(runCodeScorer("max_length", ctx("abcdef"), { maxChars: 3 }).passed === false, "max_length enforces budget");
assert(runCodeScorer("tool_args_valid", ctx("", '{"q":"x"}'), {}).passed === true, "tool_args_valid accepts JSON object");

// --- Context extraction ----------------------------------------------------
console.log("context extraction:");
const relevance = getPreset("relevance")!;
const selfTarget: ScoringTarget = {
  level: "trace",
  targetId: "t1",
  traceId: "t1",
  spanType: "agent",
  startTimeMs: 1000,
  input: '"What is Foglamp?"',
  output: '"An observability platform."',
  metadata: {},
  siblings: [],
};
const selfCtx = buildContext(selfTarget, relevance);
assert(selfCtx.input === "What is Foglamp?" && selfCtx.output === "An observability platform.", "humanizes JSON-string payloads");
assert(selfCtx.context === undefined, "no context for a self-contained preset");

const faithfulness = getPreset("faithfulness")!;
const ragTarget: ScoringTarget = {
  level: "trace",
  targetId: "root",
  traceId: "t2",
  spanType: "agent",
  startTimeMs: 5000,
  input: '"q"',
  output: '"grounded answer"',
  metadata: {},
  siblings: [
    { spanId: "e1", spanType: "embedding", output: '"retrieved chunk A"', startTimeMs: 1000 },
    { spanId: "t1", spanType: "tool", output: '"tool result B"', startTimeMs: 2000 },
    { spanId: "late", spanType: "tool", output: '"after target"', startTimeMs: 9000 },
  ],
};
const ragCtx = buildContext(ragTarget, faithfulness);
assert(ragCtx.context?.includes("retrieved chunk A") === true, "faithfulness pulls retrieved context from siblings");
assert(ragCtx.context?.includes("tool result B") === true, "context includes preceding tool output");
assert(ragCtx.context?.includes("after target") === false, "context excludes siblings after the target");

// --- Judge pure helpers ----------------------------------------------------
console.log("judge helpers:");
const relSchema = buildJudgeSchema(relevance);
assert(relSchema.safeParse({ score: 4, reason: "ok" }).success, "relevance schema accepts {score, reason}");
assert(!relSchema.safeParse({ reason: "ok" }).success, "relevance schema requires score");
const toxicity = getPreset("toxicity")!;
const toxSchema = buildJudgeSchema(toxicity);
assert(toxSchema.safeParse({ passed: true, reason: "safe" }).success, "toxicity schema accepts {passed, reason}");

const prompt = renderPrompt("Q: {input}\nA: {output}", { input: "hi", output: "yo" });
assert(prompt === "Q: hi\nA: yo", "renderPrompt substitutes fields");

const relParsed = parseJudgeObject(relevance, { score: 5, reason: "great" });
assert(relParsed.score === 5 && relParsed.passed === null, "parse maps score, leaves passed null");
const toxParsed = parseJudgeObject(toxicity, { passed: false, reason: "bad" });
assert(toxParsed.passed === false && toxParsed.score === null, "parse maps passed, leaves score null");

console.log("\nALL EVALS ENGINE CHECKS PASSED ✅");
