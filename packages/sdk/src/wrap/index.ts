// foglamp/wrap — observability for the Vercel AI SDK **v4+** by wrapping the
// module's functions (the v7 `registerTelemetry`/`integrations` API doesn't
// exist before v7; import the root `foglamp` entry for the v7 native path).
//
//   import * as ai from "ai";
//   import { wrap } from "foglamp/wrap";
//
//   const { generateText, streamText } = wrap(ai, {
//     context: { agentName: "support" },   // default trace context
//   });
//
//   // Use exactly like the AI SDK; events/traces are captured automatically.
//   await generateText({ model, prompt, foglamp: { traceName: "summarize" } });
//
// Mechanism: each tool's `execute` is wrapped for real per-tool timing, and our
// telemetry callbacks are composed over any you pass (`onChunk`/`onStepFinish`/
// `onFinish`/`onError`) — so the user's stream is never tee'd. Produces the same
// wire trace as the v7 path and shares one `Transport`. Silent no-op without an
// API key; never throws into your app.

import { resolveConfig } from "../config";
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
}

/** Per-call context, merged over the wrap-time `context` (call-time wins). */
export type CallContext = IntegrationContext;

// Add an optional `foglamp` key to a call's first argument while preserving its
// exact (version-specific) signature and return type.
type AddFoglamp<F> = F extends (args: infer A, ...rest: infer R) => infer Ret
  ? (args: A & { foglamp?: CallContext }, ...rest: R) => Ret
  : F;

/** Flush/drain handle returned alongside the wrapped functions. */
export interface WrapHandle {
  /** Flush buffered traces now (await before a serverless handler returns). */
  flush(): Promise<void>;
  /** Stop the flush timer and drain all buffered traces. */
  shutdown(): Promise<void>;
  /** Traces currently buffered (not yet POSTed). */
  readonly pending: number;
}

export type WrappedAi<T extends AiModuleLike> = {
  generateText: AddFoglamp<T["generateText"]>;
  streamText: AddFoglamp<T["streamText"]>;
  generateObject: AddFoglamp<T["generateObject"]>;
  streamObject: AddFoglamp<T["streamObject"]>;
} & WrapHandle;

export interface WrapOptions extends FoglampConfig {
  /** Default trace context applied to every wrapped call (override per call via `foglamp:`). */
  context?: IntegrationContext;
}

/**
 * Wrap an `ai` module to capture foglamp traces. Returns wrapped
 * `generateText`/`streamText`/`generateObject`/`streamObject` plus a
 * flush/shutdown handle, all sharing one `Transport`.
 */
export function wrap<T extends AiModuleLike>(ai: T, options: WrapOptions = {}): WrappedAi<T> {
  const { context: wrapContext, ...config } = options;
  const resolved = resolveConfig(config);
  const transport = new Transport(resolved);

  const guard = (fn: () => void): void => {
    if (!resolved.enabled) return;
    try {
      fn();
    } catch (error) {
      resolved.onError(error);
    }
  };

  // Split the foglamp-only `foglamp` key out of a call's args, returning a clean
  // shallow copy to forward and the merged per-call context.
  const prepare = (
    rawArgs: unknown,
  ): { clean: Record<string, unknown>; context: IntegrationContext } => {
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    const { foglamp, ...clean } = args;
    const context: IntegrationContext = {
      ...(wrapContext ?? {}),
      ...((foglamp as IntegrationContext | undefined) ?? {}),
    };
    return { clean, context };
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
    });
  };

  // --- generateText (non-streaming, read result) -------------------------
  const generateText = (async (rawArgs: unknown) => {
    if (!resolved.enabled) return (ai.generateText as AnyFn)(rawArgs as never);
    const { clean, context } = prepare(rawArgs);
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

  // --- streamText (compose callbacks, return stream untouched) -----------
  const streamText = ((rawArgs: unknown) => {
    if (!resolved.enabled) return (ai.streamText as AnyFn)(rawArgs as never);
    const { clean, context } = prepare(rawArgs);
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

  // --- generateObject (non-streaming, read result) ----------------------
  const generateObject = (async (rawArgs: unknown) => {
    if (!resolved.enabled) return (ai.generateObject as AnyFn)(rawArgs as never);
    const { clean, context } = prepare(rawArgs);
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
        }),
      );
      return result;
    } catch (error) {
      guard(() => collector.fail(error));
      throw error;
    }
  }) as AnyFn;

  // --- streamObject (compose onFinish) ----------------------------------
  const streamObject = ((rawArgs: unknown) => {
    if (!resolved.enabled) return (ai.streamObject as AnyFn)(rawArgs as never);
    const { clean, context } = prepare(rawArgs);
    const collector = newCollector("streamObject", clean, context);

    const userOnFinish = clean.onFinish as ((e: unknown) => unknown) | undefined;
    const userOnError = clean.onError as ((e: unknown) => unknown) | undefined;

    clean.onFinish = (event: unknown) => {
      const e = event as { usage?: unknown; object?: unknown } | undefined;
      guard(() => collector.completeObject({ usage: e?.usage, object: e?.object }));
      return userOnFinish?.(event);
    };
    clean.onError = (event: unknown) => {
      const error = (event as { error?: unknown } | undefined)?.error ?? event;
      guard(() => collector.fail(error));
      return userOnError?.(event);
    };

    return (ai.streamObject as AnyFn)(clean as never);
  }) as AnyFn;

  const handle = {
    generateText,
    streamText,
    generateObject,
    streamObject,
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
