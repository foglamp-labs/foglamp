import { resolveConfig } from "../config";
import { ambientContext, mergeContext, runWithContext } from "../context";
import { Transport } from "../transport";
import type { FoglampConfig, IntegrationContext } from "../types";
import { WrapCollector } from "./collector";

type AnyFn = (...args: never[]) => unknown;

/** Minimal structural shape of the `ai` module the wrapper instruments. */
export interface AiModuleLike {
  generateText: AnyFn;
  streamText: AnyFn;
  generateObject: AnyFn;
  streamObject: AnyFn;
  /** Agent classes — present on AI SDK v6/v7 (`ToolLoopAgent`) and v5+ (`Experimental_Agent`). */
  ToolLoopAgent?: unknown;
  Experimental_Agent?: unknown;
}

/** Per-call context, merged over the wrap-time `context` (call-time wins). */
export type CallContext = IntegrationContext;

// Accept an optional `foglamp` key without losing the AI SDK's generics: the
// intersection behaves like overloads, so calls that don't pass `foglamp`
// resolve against the original generic signature `F` (typed results intact),
// and calls that do fall through to the widened one. For full types *with*
// context, use `with()` instead.
type AddFoglamp<F> = F extends (args: infer A, ...rest: infer R) => infer Ret
  ? F & ((args: A & { foglamp?: CallContext }, ...rest: R) => Ret)
  : F;

// The agent classes the module actually exports, typed exactly as the originals
// (the wrapped classes are drop-in: same constructor settings, same methods).
type AgentClasses<T> = (T extends { ToolLoopAgent: infer C } ? { ToolLoopAgent: C } : unknown) &
  (T extends { Experimental_Agent: infer C } ? { Experimental_Agent: C } : unknown);

/**
 * What `with(context)` returns: the wrapped functions and agent classes with
 * the context closed over, typed **exactly** like the originals — generics,
 * `Output.object` result types and all.
 */
export type ContextBoundAi<T extends AiModuleLike> = Pick<
  T,
  "generateText" | "streamText" | "generateObject" | "streamObject"
> &
  AgentClasses<T>;

/** Flush/drain handle returned alongside the wrapped functions. */
export interface WrapHandle {
  /** Flush buffered traces now (await before a serverless handler returns). */
  flush(): Promise<void>;
  /** Stop the flush timer and drain all buffered traces. */
  shutdown(): Promise<void>;
  /** Traces currently buffered (not yet POSTed). */
  readonly pending: number;
  /**
   * Run `fn` with `context` as the **ambient** trace context: every wrapped
   * call inside it — however deeply nested — picks the context up without any
   * parameter threading, and signatures stay untouched (singleton agents stay
   * singletons, fully typed). Layering: wrap default → `run()` → `with()` →
   * per-call `foglamp:`; nested `run()`s merge inner-over-outer.
   */
  run<T>(context: CallContext, fn: () => T): T;
}

export type WrappedAi<T extends AiModuleLike> = {
  generateText: AddFoglamp<T["generateText"]>;
  streamText: AddFoglamp<T["streamText"]>;
  generateObject: AddFoglamp<T["generateObject"]>;
  streamObject: AddFoglamp<T["streamObject"]>;
} & AgentClasses<T> &
  WrapHandle & {
    /**
     * Bind a trace context and get back the wrapped functions/classes typed
     * exactly as the originals. Merges over the wrap-time `context`.
     */
    with(context: CallContext): ContextBoundAi<T>;
  };

export interface WrapOptions extends FoglampConfig {
  /** Default trace context applied to every wrapped call (override per call via `with()` or `foglamp:`). */
  context?: IntegrationContext;
}

// Shape we rely on at runtime for ToolLoopAgent / Experimental_Agent.
type AgentSettings = Record<string, unknown>;
type AgentInstance = {
  generate: (options: Record<string, unknown>) => Promise<unknown>;
  stream: (options: Record<string, unknown>) => unknown;
  id?: string;
  tools?: unknown;
};
type AgentCtor = new (settings: AgentSettings) => AgentInstance;

/**
 * Wrap an `ai` module to capture foglamp traces. Returns wrapped
 * `generateText`/`streamText`/`generateObject`/`streamObject` (plus
 * `ToolLoopAgent`/`Experimental_Agent` when the module exports them), a
 * `with(context)` binder, and a flush/shutdown handle, all sharing one
 * `Transport`.
 */
export function wrap<T extends AiModuleLike>(ai: T, options: WrapOptions = {}): WrappedAi<T> {
  const { context: wrapContext, ...config } = options;
  const resolved = resolveConfig(config);
  const transport = new Transport(resolved);
  const rootContext: IntegrationContext = wrapContext ?? {};

  const guard = (fn: () => void): void => {
    if (!resolved.enabled) return;
    try {
      fn();
    } catch (error) {
      resolved.onError(error);
    }
  };

  // Split the foglamp-only `foglamp` key out of a call's args, returning a
  // clean shallow copy to forward and the fully-layered context. `layer` is
  // the static binding (`with()` context or an agent's own context); the
  // ambient `fog.run(...)` layer is read here — at call time, not bind time —
  // so module-level singletons see the run context of whoever is calling them.
  // Layering: wrap default → run() → with()/agent → per-call `foglamp:`.
  const prepare = (
    rawArgs: unknown,
    layer: IntegrationContext,
  ): { clean: Record<string, unknown>; context: IntegrationContext } => {
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    const { foglamp, ...clean } = args;
    const base = mergeContext(mergeContext(rootContext, ambientContext()), layer);
    return { clean, context: mergeContext(base, foglamp as IntegrationContext | undefined) };
  };

  const modelInfo = (model: unknown): { provider?: string; modelId?: string } => {
    if (!model) return {};
    if (typeof model === "string") return { modelId: model };
    const m = model as { provider?: string; modelId?: string };
    return { provider: m.provider, modelId: m.modelId };
  };

  // Replace each tool's `execute` with a timed wrapper (real per-tool duration).
  const wrapTools = (tools: unknown, collector: WrapCollector): unknown => {
    if (!tools || typeof tools !== "object") return tools;
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(tools as Record<string, unknown>)) {
      const tool = value as { execute?: (input: unknown, opts?: unknown) => unknown };
      if (tool && typeof tool.execute === "function") {
        const orig = tool.execute.bind(tool);
        out[name] = {
          ...tool,
          execute: async (input: unknown, opts: unknown) => {
            const start = Date.now();
            const toolCallId = (opts as { toolCallId?: string } | undefined)?.toolCallId;
            try {
              const output = await orig(input, opts);
              guard(() => collector.recordTool({ name, toolCallId, input, output, start, end: Date.now() }));
              return output;
            } catch (error) {
              guard(() => collector.recordTool({ name, toolCallId, input, error, start, end: Date.now() }));
              throw error;
            }
          },
        };
      } else {
        out[name] = value;
      }
    }
    return out;
  };

  const newCollector = (
    operation: string,
    clean: Record<string, unknown>,
    context: IntegrationContext,
  ): WrapCollector => {
    const { provider, modelId } = modelInfo(clean.model);
    return new WrapCollector(transport, resolved, context, {
      operation,
      provider,
      modelId,
      promptRaw: clean.prompt ?? clean.messages,
      // Capture the catalog from the original tool defs — `newCollector` runs
      // before `clean.tools` is replaced by `wrapTools` (which only swaps
      // `execute`, leaving descriptions/schemas intact either way).
      toolsRaw: clean.tools,
    });
  };

  // Build the four wrapped functions bound to a context layer (`{}` for the
  // top-level handle, the `with(ctx)` context for bound copies). The wrap
  // default and ambient `run()` layers are applied underneath by `prepare`.
  const makeFns = (base: IntegrationContext) => {
    // --- generateText (non-streaming, read result) -----------------------
    const generateText = (async (rawArgs: unknown) => {
      const { clean, context } = prepare(rawArgs, base);
      if (!resolved.enabled) return (ai.generateText as AnyFn)(clean as never);
      const collector = newCollector("generateText", clean, context);
      clean.tools = wrapTools(clean.tools, collector);
      try {
        const result = await (ai.generateText as AnyFn)(clean as never);
        guard(() => collector.completeFromResult(result as never));
        return result;
      } catch (error) {
        guard(() => collector.fail(error));
        throw error;
      }
    }) as AnyFn;

    // --- streamText (compose callbacks, return stream untouched) ---------
    const streamText = ((rawArgs: unknown) => {
      const { clean, context } = prepare(rawArgs, base);
      if (!resolved.enabled) return (ai.streamText as AnyFn)(clean as never);
      const collector = newCollector("streamText", clean, context);
      clean.tools = wrapTools(clean.tools, collector);

      const userOnChunk = clean.onChunk as ((e: { chunk?: unknown }) => unknown) | undefined;
      const userOnStepFinish = clean.onStepFinish as ((s: unknown) => unknown) | undefined;
      const userOnFinish = clean.onFinish as ((e: unknown) => unknown) | undefined;
      const userOnError = clean.onError as ((e: unknown) => unknown) | undefined;

      clean.onChunk = (e: { chunk?: unknown }) => {
        guard(() => collector.onChunk(e?.chunk as never));
        return userOnChunk?.(e);
      };
      clean.onStepFinish = (step: unknown) => {
        guard(() => collector.addStreamStep(step as never));
        return userOnStepFinish?.(step);
      };
      clean.onFinish = (event: unknown) => {
        guard(() => collector.finalizeStream(event as never));
        return userOnFinish?.(event);
      };
      clean.onError = (event: unknown) => {
        const error = (event as { error?: unknown } | undefined)?.error ?? event;
        guard(() => collector.fail(error));
        return userOnError?.(event);
      };

      return (ai.streamText as AnyFn)(clean as never);
    }) as AnyFn;

    // --- generateObject (non-streaming, read result) --------------------
    const generateObject = (async (rawArgs: unknown) => {
      const { clean, context } = prepare(rawArgs, base);
      if (!resolved.enabled) return (ai.generateObject as AnyFn)(clean as never);
      const collector = newCollector("generateObject", clean, context);
      try {
        const result = (await (ai.generateObject as AnyFn)(clean as never)) as {
          object?: unknown;
          usage?: unknown;
          response?: { modelId?: string };
        };
        guard(() =>
          collector.completeObject({
            usage: result?.usage,
            object: result?.object,
            modelId: result?.response?.modelId,
            raw: result as never,
          }),
        );
        return result;
      } catch (error) {
        guard(() => collector.fail(error));
        throw error;
      }
    }) as AnyFn;

    // --- streamObject (compose onFinish) ---------------------------------
    const streamObject = ((rawArgs: unknown) => {
      const { clean, context } = prepare(rawArgs, base);
      if (!resolved.enabled) return (ai.streamObject as AnyFn)(clean as never);
      const collector = newCollector("streamObject", clean, context);

      const userOnFinish = clean.onFinish as ((e: unknown) => unknown) | undefined;
      const userOnError = clean.onError as ((e: unknown) => unknown) | undefined;

      clean.onFinish = (event: unknown) => {
        const e = event as { usage?: unknown; object?: unknown } | undefined;
        guard(() => collector.completeObject({ usage: e?.usage, object: e?.object, raw: e as never }));
        return userOnFinish?.(event);
      };
      clean.onError = (event: unknown) => {
        const error = (event as { error?: unknown } | undefined)?.error ?? event;
        guard(() => collector.fail(error));
        return userOnError?.(event);
      };

      return (ai.streamObject as AnyFn)(clean as never);
    }) as AnyFn;

    return { generateText, streamText, generateObject, streamObject };
  };

  // Wrap an agent class (ToolLoopAgent / Experimental_Agent). The facade keeps
  // the constructor settings and builds a fresh real agent per generate/stream
  // call so each call gets its own collector-bound tools — per-call attribution
  // without any shared mutable state. Constructing the real class only stores
  // settings, so the per-call construction is free.
  const wrapAgentClass = (Base: AgentCtor, baseContext: IntegrationContext): AgentCtor => {
    class FoglampAgent {
      readonly #settings: AgentSettings;
      readonly #context: IntegrationContext;
      readonly #inner: AgentInstance;

      constructor(settings: AgentSettings) {
        const { foglamp, ...rest } = (settings ?? {}) as AgentSettings & {
          foglamp?: CallContext;
        };
        this.#settings = rest;
        let ctx = mergeContext(baseContext, foglamp);
        // An agent is the canonical `agentName` carrier — default it from the
        // class's own `id` when no static layer named the trace (the ambient
        // `run()` layer is dynamic and shouldn't suppress the agent's identity).
        const staticCtx = mergeContext(rootContext, ctx);
        if (!staticCtx.agentName && !staticCtx.traceName && typeof rest.id === "string") {
          ctx = { ...ctx, agentName: rest.id };
        }
        this.#context = ctx;
        this.#inner = new Base(rest);
      }

      get id(): string | undefined {
        return this.#inner.id;
      }

      get tools(): unknown {
        return this.#inner.tools;
      }

      async generate(options: Record<string, unknown>): Promise<unknown> {
        const { clean, context } = prepare(options, this.#context);
        if (!resolved.enabled) return this.#inner.generate(clean);
        const collector = newCollector(
          "agent.generate",
          { ...clean, model: this.#settings.model, tools: this.#settings.tools },
          context,
        );
        const agent = new Base({
          ...this.#settings,
          tools: wrapTools(this.#settings.tools, collector),
        });
        try {
          const result = await agent.generate(clean);
          guard(() => collector.completeFromResult(result as never));
          return result;
        } catch (error) {
          guard(() => collector.fail(error));
          throw error;
        }
      }

      stream(options: Record<string, unknown>): unknown {
        const { clean, context } = prepare(options, this.#context);
        if (!resolved.enabled) return this.#inner.stream(clean);
        const collector = newCollector(
          "agent.stream",
          { ...clean, model: this.#settings.model, tools: this.#settings.tools },
          context,
        );
        // Steps and the final text arrive via the settings-level callbacks
        // (the class merges these with any per-call `onStepFinish`, so user
        // callbacks still run). Agent streams expose no `onChunk`, so TTFT /
        // chunk curves aren't sampled on this path.
        const settingsOnStepFinish = this.#settings.onStepFinish as
          | ((s: unknown) => unknown)
          | undefined;
        const settingsOnFinish = this.#settings.onFinish as ((e: unknown) => unknown) | undefined;
        const agent = new Base({
          ...this.#settings,
          tools: wrapTools(this.#settings.tools, collector),
          onStepFinish: (step: unknown) => {
            guard(() => collector.addStreamStep(step as never));
            return settingsOnStepFinish?.(step);
          },
          onFinish: (event: unknown) => {
            guard(() => collector.finalizeStream(event as never));
            return settingsOnFinish?.(event);
          },
        });
        return agent.stream(clean);
      }
    }
    return FoglampAgent as unknown as AgentCtor;
  };

  // The agent classes the module exports, wrapped and bound to a context.
  const makeAgentClasses = (base: IntegrationContext): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    const toolLoop = (ai as Record<string, unknown>).ToolLoopAgent;
    const experimental = (ai as Record<string, unknown>).Experimental_Agent;
    if (typeof toolLoop === "function") {
      out.ToolLoopAgent = wrapAgentClass(toolLoop as AgentCtor, base);
    }
    if (typeof experimental === "function") {
      // On v6/v7 `Experimental_Agent` is an alias of `ToolLoopAgent`.
      out.Experimental_Agent =
        experimental === toolLoop
          ? out.ToolLoopAgent
          : wrapAgentClass(experimental as AgentCtor, base);
    }
    return out;
  };

  const handle = {
    ...makeFns({}),
    ...makeAgentClasses({}),
    with: (context: CallContext) => ({
      ...makeFns(context),
      ...makeAgentClasses(context),
    }),
    run: runWithContext,
    flush: () => transport.flush(),
    shutdown: () => transport.shutdown(),
    get pending() {
      return transport.size();
    },
  };
  return handle as unknown as WrappedAi<T>;
}

export type { FoglampConfig, IntegrationContext, MetadataInput } from "../types";
export type { Span, SpanType, Trace, Usage } from "../wire";
