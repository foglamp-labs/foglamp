// The agent-facing contract for the instrumentation approval loop, served at
// GET /setup/prompt. The prompt a user actually pastes (lib/agent-prompt.ts) is
// four lines long and fetches this — so the contract can change without anyone
// re-copying a prompt out of the docs.
//
// The whole design rests on step 4: the agent makes ONE blocking call and the
// server holds it until the user clicks Approve. A model asked to "keep polling"
// forgets; a blocked bash command cannot.

import { SCAN_RULES, SCAN_SHAPE } from "./scan-prompt";

export const SETUP_API_BASE = "https://api.foglamp.dev";

// Canonical instrumentation instructions, written for coding agents: version
// aware (wrap() for AI SDK v4-v6, fog.integration() for v7), plus serverless
// flush and the HUD overlay.
const AGENT_DOCS_URL = "https://docs.foglamp.dev/ai-instrument.md";
const HUD_DOCS_URL = "https://docs.foglamp.dev/sdk/hud";

export const SETUP_PROMPT = `Set up Foglamp tracing in THIS repository (observability for Vercel AI SDK apps).

This is an approval loop, not a one-shot edit: you discover what's here, upload a
plan, the user approves it in their browser, and you resume automatically and
apply it. Read every step before you start.

Two rules that override everything else:
- Change NO code until the plan is approved (step 4 returns).
- Upload metadata only — symbol names, file:line references, counts, and short
  plain-English descriptions. Never source code, prompt text, model output,
  environment values, or secrets.

Requires FOGLAMP_API_KEY in .env, plus curl and jq.

## 1. Discover (read only)
- Read package.json for the \`ai\` dependency: note the major (4, 5, 6 or 7) and
  the exact installed version. Do NOT upgrade it — Foglamp supports all four.
- Find every model call site: generateText / streamText / generateObject /
  streamObject / the Agent class. Record file:line, which function, and the model
  id when it's a static literal.
- Decide what each call *is*:
  - an **agent** — a named flow that runs repeatedly (a support agent, a research
    loop). One-shot calls (a title generator, a classifier) are agents with
    \`oneOff: true\`; they get a traceName instead of an agentName.
  - a **workflow** — several calls that always run together as one job, sharing a
    per-run id. Batch jobs, crons and pipelines are ALWAYS workflows.
  - a **session** — a real end-user conversation thread with persisted history.
    Nothing else. A cron run is not a session.
  - **customer attribution** — only if the app serves distinct end-customers or
    tenants. For a single-tenant app the correct answer is \`recommended: false\`.
- Build the architecture map (the "scan" object) — see the shape below.
- Note whether the repo has a React UI (for the dev-only HUD overlay).

Be honest with \`confidence\`. The user reads it, and "medium" on a guess is far
more useful than a confident wrong name.

## 2. Write .foglamp/plan.json
{
  "version": 1,
  "sdk": { "major": 5, "version": "5.0.12" },
  "hasReactUi": true,
  "scan": { ...the architecture map, exactly the shape in section 3... },
  "calls": [
    { "id": "c1", "fn": "streamText", "sourceRef": "src/app/api/chat/route.ts:31",
      "modelId": "gpt-4o" },
    { "id": "c2", "fn": "generateObject", "sourceRef": "src/jobs/digest.ts:22" }
  ],
  "decisions": {
    "agents": [
      { "id": "a1", "name": "Support agent", "callIds": ["c1"], "oneOff": false,
        "confidence": "high", "sourceRef": "src/agents/support.ts:42",
        "rationale": "Multi-step tool loop that answers customer tickets." }
    ],
    "workflows": [
      { "id": "w1", "name": "Nightly digest", "callIds": ["c2"],
        "runIdSource": "the job id from the queue payload",
        "confidence": "medium", "sourceRef": "src/jobs/digest.ts:18",
        "rationale": "Both calls always run together for a single scheduled job." }
    ],
    "sessions": [
      { "id": "s1", "label": "Dashboard chat", "callIds": ["c1"],
        "sessionIdSource": "the thread id on the request body",
        "confidence": "high", "sourceRef": "src/app/api/chat/route.ts:31",
        "rationale": "Real back-and-forth conversation with persisted history." }
    ],
    "customer": {
      "recommended": false, "confidence": "high",
      "rationale": "Single-tenant app — every run belongs to the same account."
    }
  }
}

Plan rules (a plan that breaks one is rejected with 422 and a details list):
- version is always 1. sdk.major must be 4, 5, 6 or 7.
- calls <= 200, agents <= 40, workflows <= 20, sessions <= 20. Call ids are
  unique, and every id in a callIds array must be one you listed in "calls".
- name / label <= 48 chars and must be a STATIC literal — never an id, slug, URL
  or date. Dynamic values belong in runIdSource / sessionIdSource / customer.
- runIdSource, sessionIdSource and customer.idSource are PROSE (<= 160 chars)
  describing where the value comes from — "the thread id on the request body",
  not a code expression. You turn them into code in step 5.
- rationale <= 200 chars, one plain sentence, no code.
- customer.idSource is required when customer.recommended is true.
- Omit an array entirely rather than inventing entries to fill it.

## 3. The architecture map ("scan")
This is the picture the user reviews, so make it worth looking at: map the
business logic too, not just the AI calls. When nodes belong to a workflow you
listed in decisions, set their \`group\` to that workflow's exact name — the
review map draws matching groups as workflows.
${SCAN_SHAPE}

${SCAN_RULES}

## 4. Upload, show the link, and WAIT
Tell the user plainly what you're about to send: "This uploads a structured
summary of your architecture and what I plan to instrument — names, file
references and counts, no code or secrets." Then:

  KEY=$(grep -m1 '^FOGLAMP_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  curl -sS -X POST ${SETUP_API_BASE}/instrumentation-plans \\
    -H "authorization: Bearer $KEY" \\
    -H 'content-type: application/json' \\
    --data @.foglamp/plan.json > .foglamp/plan.lock.json

(If the key lives somewhere other than ./.env, read it from there instead. Never
print it, and never put it in a URL.)

The response is { "id", "reviewUrl", "status", "expiresAt" }. Make sure
.foglamp/ is gitignored. On a 422, read \`details\`, fix .foglamp/plan.json, retry.

Give the user the reviewUrl and tell them exactly this: "Open this to review what
I found. I'll wait here — approve it and I'll pick up automatically. You don't
need to message me again."

Then run this as ONE bash command and let it block. Do not poll by hand, do not
ask the user to tell you when they're done:

  KEY=$(grep -m1 '^FOGLAMP_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  PLAN=$(jq -r .id .foglamp/plan.lock.json)
  END=$(( $(date +%s) + 420 ))
  while [ "$(date +%s)" -lt "$END" ]; do
    R=$(curl -sS --max-time 20 -H "authorization: Bearer $KEY" \\
      "${SETUP_API_BASE}/instrumentation-plans/$PLAN/status?wait=1")
    S=$(printf '%s' "$R" | jq -r .status 2>/dev/null)
    case "$S" in
      awaiting_approval) sleep 1 ;;
      ""|null) sleep 2 ;;
      *) echo "$R"; break ;;
    esac
  done

Each request is held open server-side for up to ~9 seconds, so this costs almost
nothing and returns within a second of the user clicking. What it prints:
- \`approved\` or \`applying\` — go to step 5. The response carries \`decisions\`
  (the approved plan), \`sdk\` and \`hasReactUi\`; use those, not your local copy.
- \`rejected\` — stop. Change nothing. Tell the user their repo is untouched.
- \`expired\` — the plan timed out. Start again at step 1.
- nothing at all — the 7-minute bound was hit. Run the exact same command again.
  After about 30 minutes with no answer, stop and tell the user to approve the
  link whenever they're ready and you'll continue then.

## 5. Apply the approved plan
Fetch ${AGENT_DOCS_URL} and follow it.
On AI SDK v4-v6 wrap the \`ai\` module with \`wrap()\` from \`foglamp/wrap\`; on v7
attach \`fog.integration(...)\` to the calls.

Then implement the approved decisions exactly:
- each agent's \`name\` becomes \`agentName\` on its calls (\`traceName\` when
  \`oneOff\` is true);
- each workflow's \`name\` becomes a shared \`workflowName\`, and you write the code
  that produces \`workflowRunId\` from its \`runIdSource\`;
- each session's \`sessionIdSource\` becomes the \`sessionId\` expression;
- if customer attribution was recommended, attach \`customer\` (\`{ id, name?,
  imageUrl? }\`) built from its sources.

Don't rename things the user approved, and don't label calls that no decision
covers. Anything dynamic (ids, slugs, URLs, dates) goes in \`metadata\`,
\`workflowRunId\`, \`sessionId\` or \`customer.id\` — never in a name.

If \`hasReactUi\` is true and there's a local dev server, also turn on the HUD: a
dev-only floating panel that streams runs as the user develops. Pass
\`hud: true\` to \`foglamp({ ... })\` and render \`<FoglampHUD />\` from \`foglamp/hud\`
near the root of the client app. It needs no API key and is a no-op in
production. Details: ${HUD_DOCS_URL}

## 6. Report back
Write .foglamp/applied.json:
{
  "version": 1,
  "scan": { ...the map, updated for anything you learned while editing... },
  "calls": [
    { "id": "c1", "instrumented": true },
    { "id": "c2", "instrumented": false, "note": "unreachable code path" }
  ],
  "filesChanged": ["src/app/api/chat/route.ts", "instrumentation.ts"],
  "warnings": ["The nightly cron needs an explicit flush() before exit."],
  "hudEnabled": true
}

then upload it:

  curl -sS -X POST ${SETUP_API_BASE}/instrumentation-plans/$PLAN/applied \\
    -H "authorization: Bearer $KEY" \\
    -H 'content-type: application/json' --data @.foglamp/applied.json

filesChanged is repo-relative paths only — no diffs, no file contents (<= 100
entries). warnings is anything the user should know (<= 20, <= 200 chars each).

Finally: do NOT write smoke tests, scripts or demo endpoints to produce a first
trace. Tell the user which of their REAL flows to trigger — which command to run,
which page to hit — and point them back at the review link, which flips to
verified the moment the first real trace lands.

## If you get stuck after the plan is approved
Report it instead of going quiet, so the review page says where it stopped
instead of spinning forever:

  curl -sS -X POST ${SETUP_API_BASE}/instrumentation-plans/$PLAN/failed \\
    -H "authorization: Bearer $KEY" -H 'content-type: application/json' \\
    -d '{"stage":"apply"}'

stage is one of:
- "detect" — the approved plan doesn't match the repo any more (the call sites
  you recorded moved or are gone).
- "apply" — you couldn't finish the edits.
- "verify" — the edits are in but something is clearly broken.

Then tell the user what happened in your own words. Before approval there is
nothing to report — if you can't build a plan at all, just say so and stop.
`;
