import { describe, expect, test } from "bun:test";

import type * as RealAi from "ai";

import { wrap, type WrappedAi } from "./index";
import type { Trace } from "../wire";

// ---------- type-level: `with()` must return the ORIGINAL ai signatures ------

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

type Wrapped = WrappedAi<typeof RealAi>;
type Bound = ReturnType<Wrapped["with"]>;

// Generics survive: the bound functions/classes are the ai module's own types.
const _generateTextTyped: AssertEqual<Bound["generateText"], typeof RealAi.generateText> = true;
const _streamTextTyped: AssertEqual<Bound["streamText"], typeof RealAi.streamText> = true;
const _generateObjectTyped: AssertEqual<Bound["generateObject"], typeof RealAi.generateObject> =
  true;
const _agentClassTyped: AssertEqual<Bound["ToolLoopAgent"], typeof RealAi.ToolLoopAgent> = true;
void [_generateTextTyped, _streamTextTyped, _generateObjectTyped, _agentClassTyped];

// ---------- runtime: fake ai module + captured ingest ------------------------

function makeFakeAi() {
  const calls: Record<string, unknown>[] = [];
  class FakeToolLoopAgent {
    settings: Record<string, unknown>;
    constructor(settings: Record<string, unknown>) {
      this.settings = settings;
    }
    get id() {
      return this.settings.id as string | undefined;
    }
    get tools() {
      return this.settings.tools;
    }
    async generate(options: Record<string, unknown>) {
      calls.push({ fn: "agent.generate", settings: this.settings, options });
      const tools = (this.settings.tools ?? {}) as Record<
        string,
        { execute?: (input: unknown, opts?: unknown) => unknown }
      >;
      for (const tool of Object.values(tools)) {
        await tool.execute?.({ q: "input" }, { toolCallId: "tc-1" });
      }
      return {
        text: "agent done",
        steps: [{ text: "agent done", usage: { inputTokens: 1, outputTokens: 2 } }],
        usage: { inputTokens: 1, outputTokens: 2 },
      };
    }
    stream(options: Record<string, unknown>) {
      calls.push({ fn: "agent.stream", settings: this.settings, options });
      const settings = this.settings as {
        onStepFinish?: (s: unknown) => unknown;
        onFinish?: (e: unknown) => unknown;
      };
      settings.onStepFinish?.({ text: "chunked", usage: { outputTokens: 2 } });
      settings.onFinish?.({ text: "chunked" });
      return { ok: true };
    }
  }
  const fake = {
    generateText: async (args: Record<string, unknown>) => {
      calls.push({ fn: "generateText", args });
      return { text: "ok", steps: [], usage: { inputTokens: 3, outputTokens: 4 } };
    },
    streamText: (args: Record<string, unknown>) => {
      calls.push({ fn: "streamText", args });
      return { ok: true };
    },
    generateObject: async (args: Record<string, unknown>) => {
      calls.push({ fn: "generateObject", args });
      return { object: { a: 1 }, usage: { inputTokens: 1, outputTokens: 1 } };
    },
    streamObject: (args: Record<string, unknown>) => {
      calls.push({ fn: "streamObject", args });
      return { ok: true };
    },
    ToolLoopAgent: FakeToolLoopAgent,
    Experimental_Agent: FakeToolLoopAgent,
  };
  return { fake, calls };
}

function makeCapture() {
  const batches: Trace[][] = [];
  const fetchImpl = (async (_url: unknown, init?: { body?: unknown }) => {
    batches.push(JSON.parse(String(init?.body)).traces as Trace[]);
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const traces = () => batches.flat();
  return { fetchImpl, traces };
}

const OPTS = { apiKey: "fl_test", flushIntervalMs: 60_000 };

describe("wrap", () => {
  test("strips the foglamp key and applies merged context + metadata", async () => {
    const { fake, calls } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, {
      ...OPTS,
      fetch: fetchImpl,
      context: { agentName: "base", metadata: { env: "test" } },
    });

    await fog.generateText({
      model: { provider: "openai", modelId: "gpt-4o" },
      prompt: "hi",
      foglamp: { agentName: "summarizer", metadata: { userId: "u1" } },
    } as never);
    await fog.flush();

    const forwarded = calls[0]!.args as Record<string, unknown>;
    expect("foglamp" in forwarded).toBe(false);
    expect(forwarded.prompt).toBe("hi");

    const trace = traces()[0]!;
    expect(trace.agentName).toBe("summarizer");
    // metadata merges across layers instead of being replaced wholesale
    expect(trace.metadata).toEqual({ env: "test", userId: "u1" });
  });

  test("with() binds context and forwards args untouched", async () => {
    const { fake, calls } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    const bound = fog.with({
      agentName: "retriever",
      workflowName: "pipeline",
      workflowRunId: "run-1",
    });
    await (bound.generateObject as (a: unknown) => Promise<unknown>)({
      model: "gpt-4o-mini",
      prompt: "obj",
    });
    await fog.flush();

    expect("foglamp" in (calls[0]!.args as object)).toBe(false);
    const trace = traces()[0]!;
    expect(trace.agentName).toBe("retriever");
    expect(trace.workflowName).toBe("pipeline");
    expect(trace.workflowRunId).toBe("run-1");
  });

  test("the customer object flows onto the enqueued trace", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    const bound = fog.with({
      agentName: "retriever",
      customer: { id: "cust_1", name: "Acme", imageUrl: "https://x/a.png" },
    });
    await (bound.generateText as (a: unknown) => Promise<unknown>)({
      model: "gpt-4o-mini",
      prompt: "hi",
    });
    await fog.flush();

    const trace = traces()[0]!;
    expect(trace.customer).toEqual({
      id: "cust_1",
      name: "Acme",
      imageUrl: "https://x/a.png",
    });
  });

  test("ToolLoopAgent: traces generate(), wraps tools, defaults agentName from id", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    const Agent = fog.ToolLoopAgent as new (s: Record<string, unknown>) => {
      generate: (o: Record<string, unknown>) => Promise<{ text: string }>;
      id?: string;
    };
    const agent = new Agent({
      id: "thesis-agent",
      model: { provider: "openai", modelId: "gpt-4o" },
      tools: { search: { description: "find", execute: async () => "found" } },
    });
    expect(agent.id).toBe("thesis-agent");

    const result = await agent.generate({ prompt: "go" });
    expect(result.text).toBe("agent done");
    await fog.flush();

    const trace = traces()[0]!;
    expect(trace.agentName).toBe("thesis-agent");
    const toolSpans = trace.spans.filter((s) => s.spanType === "tool");
    expect(toolSpans).toHaveLength(1);
    expect(toolSpans[0]!.name).toBe("search");
  });

  test("ToolLoopAgent: stream() finalizes via composed settings callbacks", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    let userFinishRan = false;
    const Agent = fog.with({ agentName: "streamer" }).ToolLoopAgent as new (
      s: Record<string, unknown>,
    ) => { stream: (o: Record<string, unknown>) => unknown };
    const agent = new Agent({
      model: "gpt-4o",
      onFinish: () => {
        userFinishRan = true;
      },
    });
    agent.stream({ prompt: "go" });
    await fog.flush();

    expect(userFinishRan).toBe(true);
    const trace = traces()[0]!;
    expect(trace.agentName).toBe("streamer");
    expect(trace.spans.some((s) => s.spanType === "llm")).toBe(true);
  });

  test("run(): ambient context reaches nested calls and singleton agents", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    // Module-level singleton, constructed OUTSIDE any run() scope.
    const Agent = fog.ToolLoopAgent as new (s: Record<string, unknown>) => {
      generate: (o: Record<string, unknown>) => Promise<unknown>;
    };
    const agent = new Agent({ id: "thesis-agent", model: "gpt-4o" });

    await fog.run(
      { workflowName: "onboarding", workflowRunId: "run-1", metadata: { brandId: "b1" } },
      async () => {
        // Nested helper two awaits deep — no parameter threading.
        const nested = async () => agent.generate({ prompt: "go" });
        await Promise.resolve();
        await nested();
      },
    );
    await fog.flush();

    const trace = traces()[0]!;
    expect(trace.agentName).toBe("thesis-agent"); // agent identity survives
    expect(trace.workflowName).toBe("onboarding"); // ambient layer applied
    expect(trace.workflowRunId).toBe("run-1");
    expect(trace.metadata).toEqual({ brandId: "b1" });
  });

  test("run(): with()/per-call win over ambient; nested runs merge inner-over-outer", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });
    const bound = fog.with({ agentName: "bound", metadata: { layer: "with" } });

    await fog.run({ agentName: "ambient", metadata: { run: "outer", layer: "run" } }, () =>
      fog.run({ metadata: { run: "inner" } }, async () => {
        await (bound.generateText as (a: unknown) => Promise<unknown>)({ prompt: "p" });
      }),
    );
    await fog.flush();

    const trace = traces()[0]!;
    expect(trace.agentName).toBe("bound"); // with() beats ambient
    // metadata merges across all layers; inner run beats outer, with() beats run
    expect(trace.metadata).toEqual({ run: "inner", layer: "with" });
  });

  test("run(): calls outside the scope are unaffected", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    fog.run({ workflowName: "w", workflowRunId: "r" }, () => undefined);
    await fog.generateText({ prompt: "p", foglamp: { traceName: "solo" } } as never);
    await fog.flush();

    const trace = traces()[0]!;
    expect(trace.workflowName).toBeUndefined();
    expect(trace.traceName).toBe("solo");
  });

  test("streamText: reasoning chunks → reasoning duration; TTFT anchors at first reasoning chunk", async () => {
    const { fake, calls } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (fog.streamText as (a: unknown) => unknown)({ model: "gpt-5", prompt: "think" });
    // The wrapper composes its telemetry callbacks onto the forwarded args —
    // drive them like a real stream: silent wait, reasoning block, then text.
    const args = calls[0]!.args as {
      onChunk: (e: { chunk: unknown }) => void;
      onStepFinish: (s: unknown) => void;
      onFinish: (e: unknown) => void;
    };
    await sleep(30);
    args.onChunk({ chunk: { type: "reasoning-start", id: "r1" } });
    args.onChunk({ chunk: { type: "reasoning-delta", id: "r1", text: "let me think" } });
    await sleep(20);
    args.onChunk({ chunk: { type: "reasoning-delta", id: "r1", text: " about this" } });
    args.onChunk({ chunk: { type: "reasoning-end", id: "r1" } });
    await sleep(20);
    args.onChunk({ chunk: { type: "text-delta", text: "the answer" } });
    args.onStepFinish({
      text: "the answer",
      usage: { inputTokens: 10, outputTokens: 30, reasoningTokens: 20 },
    });
    args.onFinish({ text: "the answer" });
    await fog.flush();

    const llm = traces()[0]!.spans.find((s) => s.spanType === "llm")!;
    // The block ran ~20ms between its deltas before reasoning-end closed it.
    expect(llm.reasoningDurationMs!).toBeGreaterThan(0);
    // TTFT = first reasoning chunk (after the ~30ms silent wait), NOT the
    // text-delta that arrived ~40ms later (~70ms in).
    expect(llm.ttftMs!).toBeGreaterThanOrEqual(20);
    expect(llm.ttftMs!).toBeLessThan(65);
  });

  test("streamText: no reasoning chunks → reasoning duration stays absent", async () => {
    const { fake, calls } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    (fog.streamText as (a: unknown) => unknown)({ model: "gpt-4o", prompt: "p" });
    const args = calls[0]!.args as {
      onChunk: (e: { chunk: unknown }) => void;
      onStepFinish: (s: unknown) => void;
      onFinish: (e: unknown) => void;
    };
    args.onChunk({ chunk: { type: "text-delta", text: "plain" } });
    args.onStepFinish({ text: "plain", usage: { inputTokens: 1, outputTokens: 2 } });
    args.onFinish({ text: "plain" });
    await fog.flush();

    const llm = traces()[0]!.spans.find((s) => s.spanType === "llm")!;
    expect(llm.reasoningDurationMs).toBeUndefined();
  });

  test("generateObject: captures provider signals on the llm span", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    // Override with a result carrying fingerprint + rate-limit headers.
    (fake as { generateObject: unknown }).generateObject = async () => ({
      object: { a: 1 },
      usage: { inputTokens: 5, outputTokens: 7 },
      finishReason: "stop",
      response: {
        modelId: "gpt-4o-2024-08-06",
        headers: {
          "x-ratelimit-remaining-tokens": "900",
          "x-ratelimit-limit-tokens": "1000",
        },
      },
      providerMetadata: { openai: { systemFingerprint: "fp_obj" } },
    });
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    await (fog.generateObject as (a: unknown) => Promise<unknown>)({
      model: "gpt-4o",
      prompt: "obj",
      foglamp: { traceName: "obj-t" },
    });
    await fog.flush();

    const llm = traces()[0]!.spans.find((s) => s.spanType === "llm")!;
    expect(llm.modelId).toBe("gpt-4o-2024-08-06");
    expect(llm.systemFingerprint).toBe("fp_obj");
    expect(llm.rateLimit).toEqual({ tokensRemaining: 900, tokensLimit: 1000 });
    // The wrap path never measures a pure model-call window.
    expect(llm.modelCallMs).toBeUndefined();
  });

  test("streamObject: captures provider signals via composed onFinish", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    (fake as { streamObject: unknown }).streamObject = (args: Record<string, unknown>) => {
      (args.onFinish as ((e: unknown) => void) | undefined)?.({
        usage: { inputTokens: 2, outputTokens: 3 },
        object: { b: 2 },
        finishReason: "stop",
        response: { headers: { "anthropic-ratelimit-tokens-remaining": "50" } },
        providerMetadata: { anthropic: {} },
      });
      return { ok: true };
    };
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    (fog.streamObject as (a: unknown) => unknown)({
      model: "claude-haiku-4-5",
      prompt: "obj",
      foglamp: { traceName: "obj-stream" },
    });
    await fog.flush();

    const llm = traces()[0]!.spans.find((s) => s.spanType === "llm")!;
    expect(llm.rateLimit).toEqual({ tokensRemaining: 50 });
    expect(llm.usage?.outputTokens).toBe(3);
  });

  test("system prompt + generation settings land on the root span; settings on llm spans", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    (fake as { generateText: unknown }).generateText = async () => ({
      text: "ok",
      steps: [
        {
          text: "ok",
          usage: { inputTokens: 1, outputTokens: 1 },
          response: { modelId: "gpt-4o-2024-08-06" },
          warnings: [{ type: "unsupported", feature: "topK" }],
        },
      ],
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });

    await fog.generateText({
      model: { provider: "openai", modelId: "gpt-4o" },
      system: "You are terse.",
      prompt: "hi",
      temperature: 0.1,
      maxOutputTokens: 200,
      foglamp: { agentName: "terse" },
    } as never);
    await fog.flush();

    const trace = traces()[0]!;
    const root = trace.spans.find((s) => s.spanType === "agent")!;
    expect(root.systemPrompt).toBe("You are terse.");
    expect(root.metadata).toEqual({ temperature: "0.1", maxOutputTokens: "200" });
    const llm = trace.spans.find((s) => s.spanType === "llm")!;
    expect(llm.systemPrompt).toBeUndefined();
    expect(llm.metadata).toMatchObject({
      temperature: "0.1",
      maxOutputTokens: "200",
      servedModelId: "gpt-4o-2024-08-06",
      warnings: '[{"type":"unsupported","feature":"topK"}]',
      stepNumber: "0",
    });
  });

  test("system prompt falls back to leading system messages; recordSystemPrompt: false drops it", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });
    await fog.generateText({
      model: "m",
      messages: [
        { role: "system", content: "From messages." },
        { role: "user", content: "hi" },
      ],
    } as never);
    await fog.flush();
    expect(traces()[0]!.spans[0]!.systemPrompt).toBe("From messages.");

    const off = wrap(makeFakeAi().fake, { ...OPTS, fetch: fetchImpl, recordSystemPrompt: false });
    await off.generateText({ model: "m", system: "secret", prompt: "hi" } as never);
    await off.flush();
    expect(traces()[1]!.spans[0]!.systemPrompt).toBeUndefined();
    // The input itself is still recorded.
    expect(traces()[1]!.spans[0]!.input).toBe("hi");
  });

  test("ToolLoopAgent: instructions become the system prompt", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });
    const Agent = fog.ToolLoopAgent as new (s: Record<string, unknown>) => {
      generate: (o: Record<string, unknown>) => Promise<{ text: string }>;
    };
    const agent = new Agent({
      id: "planner",
      model: { provider: "openai", modelId: "gpt-4o" },
      instructions: [{ role: "system", content: "Plan carefully." }],
      temperature: 0,
    });
    await agent.generate({ prompt: "go" });
    await fog.flush();
    const root = traces()[0]!.spans.find((s) => s.spanType === "agent")!;
    expect(root.systemPrompt).toBe("Plan carefully.");
    expect(root.metadata).toEqual({ temperature: "0" });
  });

  test("generateObject: the output schema is recorded as metadata", async () => {
    const { fake } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { ...OPTS, fetch: fetchImpl });
    await (fog.generateObject as (a: unknown) => Promise<unknown>)({
      model: "gpt-4o",
      prompt: "obj",
      schema: { type: "object", properties: { a: { type: "number" } } },
    });
    await fog.flush();
    const root = traces()[0]!.spans.find((s) => s.spanType === "agent")!;
    expect(root.metadata?.outputSchema).toContain('"properties"');
  });

  test("no API key: passes through (foglamp stripped) and sends nothing", async () => {
    const { fake, calls } = makeFakeAi();
    const { fetchImpl, traces } = makeCapture();
    const fog = wrap(fake, { apiKey: undefined, fetch: fetchImpl });

    await fog.generateText({ prompt: "hi", foglamp: { traceName: "t" } } as never);
    const Agent = fog.ToolLoopAgent as new (s: Record<string, unknown>) => {
      generate: (o: Record<string, unknown>) => Promise<unknown>;
    };
    await new Agent({ model: "m", foglamp: { agentName: "x" } }).generate({ prompt: "p" });
    await fog.flush();

    expect("foglamp" in (calls[0]!.args as object)).toBe(false);
    expect("foglamp" in (calls[1]!.settings as object)).toBe(false);
    expect(traces()).toHaveLength(0);
  });
});
