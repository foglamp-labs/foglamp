import { foglamp } from "foglamp";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import { AGENTS, type AgentMeta } from "../agents";

// HUD on, on a separate port from the dashboard dogfood (8517) so the two can
// run side by side. Constructing this starts the local broker.
const fog = foglamp({ hud: true, hudPort: 8518 });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));
const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});

type Move = { tool: string; input: unknown } | null;

// Pick a varied subset of an agent's tools for a single run: a random count
// (always ≥2) and a random selection, but re-sorted to keep the declared
// pipeline order. So successive runs exercise different tool cascades instead of
// firing every tool every time.
function pickTools(all: string[]): string[] {
  const n = rand(2, all.length + 1); // 2..all.length inclusive
  const idx = [...all.keys()].sort(() => Math.random() - 0.5).slice(0, n);
  return idx.sort((a, b) => a - b).map((i) => all[i]!);
}

function model(meta: AgentMeta, script: Move[]) {
  let step = 0;
  return new MockLanguageModelV4({
    provider: meta.provider,
    modelId: meta.model,
    doGenerate: async () => {
      const move = script[Math.min(step, script.length - 1)];
      step += 1;
      await sleep(rand(900, 2200)); // "thinking" so the HUD reads as live
      if (move) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: `c${step}`,
              toolName: move.tool,
              input: JSON.stringify(move.input),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage: usage(rand(700, 1400), rand(12, 30)),
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: "Done." }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: usage(rand(1400, 2200), rand(40, 90)),
        warnings: [],
      };
    },
  });
}

// Generic tools that just succeed after a beat; optionally one throws once.
function buildTools(names: string[], failTool?: string): ToolSet {
  const tools: ToolSet = {};
  let failed = false;
  names.forEach((name, i) => {
    tools[name] = tool({
      description: name,
      inputSchema: z.object({}).loose(),
      execute: async () => {
        await sleep(rand(700, 1700));
        if (name === failTool && !failed) {
          failed = true;
          throw new Error("upstream_unavailable");
        }
        return { ok: true, step: i };
      },
    });
  });
  return tools;
}

/** One run of an agent, streamed live to the HUD. */
export async function runAgent(id: string): Promise<void> {
  const meta = AGENTS.find((a) => a.id === id);
  if (!meta) return;

  let script: Move[];
  let tools: ToolSet;

  if (meta.id === "support") {
    // The storyboard: lookup → refund FAILS → refund retry succeeds → email.
    // The surrounding steps vary (sometimes a stock check up front, a Slack ping
    // at the end), and apply_credit stays in the armory but is rarely used.
    const pre = Math.random() < 0.5 ? [{ tool: "check_inventory", input: { sku: "sku_19" } }] : [];
    const post = Math.random() < 0.5 ? [{ tool: "notify_slack", input: { channel: "#support" } }] : [];
    script = [
      ...pre,
      { tool: "lookup_order", input: { orderId: "o_8842" } },
      { tool: "issue_refund", input: { orderId: "o_8842" } },
      { tool: "issue_refund", input: { orderId: "o_8842", retry: true } },
      { tool: "send_email", input: { to: "alex@acme.com" } },
      ...post,
      null,
    ];
    let firstRefund = true;
    const okTool = (desc: string, ms: [number, number], out: object) =>
      tool({
        description: desc,
        inputSchema: z.object({}).loose(),
        execute: async () => {
          await sleep(rand(ms[0], ms[1]));
          return out;
        },
      });
    tools = {
      lookup_order: okTool("Look up an order", [700, 1300], { status: "found", total: 42 }),
      check_inventory: okTool("Check inventory", [500, 1000], { inStock: true }),
      apply_credit: okTool("Apply account credit", [600, 1100], { credited: true }),
      send_email: okTool("Email the customer", [600, 1200], { sent: true }),
      notify_slack: okTool("Notify the support channel", [400, 900], { posted: true }),
      issue_refund: tool({
        description: "Issue a refund",
        inputSchema: z.object({}).loose(),
        execute: async () => {
          await sleep(rand(900, 1600));
          if (firstRefund) {
            firstRefund = false;
            throw new Error("card_expired");
          }
          return { refunded: true, amount: 42 };
        },
      }),
    };
  } else {
    // Fire a varied subset each run, but register the full armory so the HUD
    // still shows every available tool (with only the used ones highlighted).
    const used = pickTools(meta.tools);
    script = [...used.map((t) => ({ tool: t, input: { q: meta.name } })), null];
    const fail =
      meta.id === "triage" && Math.random() < 0.5 ? used[used.length - 1] : undefined;
    tools = buildTools(meta.tools, fail);
  }

  await generateText({
    model: model(meta, script),
    tools,
    stopWhen: stepCountIs(script.length + 2),
    prompt: `Run ${meta.name}.`,
    telemetry: {
      integrations: [fog.integration({ agentName: meta.name, sessionId: `sess_${id}` })],
    },
  }).catch(() => {
    /* errored runs still surface in the HUD via onError */
  });
}

/**
 * Fire runs across the session, mostly separated in time with only two
 * deliberate overlapping pairs (analyst+reviewer, triage+analyst) — so the
 * timeline reads cleanly and clustering only kicks in a couple of times.
 */
export function runStorm(): void {
  const plan: Array<[string, number]> = [
    ["support", 0],
    ["analyst", 16_000],
    ["reviewer", 18_500], // overlaps analyst
    ["sql", 34_000],
    ["researcher", 48_000],
    ["triage", 64_000],
    ["analyst", 66_000], // overlaps triage
    ["sql", 82_000],
  ];
  for (const [id, delay] of plan) setTimeout(() => void runAgent(id), delay);
}
