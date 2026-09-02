import { runAgent } from "./server/run";

const PORT = 8518;

async function waitForHealth(timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) {
        await res.text();
        return;
      }
    } catch {
      // broker not up yet
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("HUD broker never came up");
}

type AnyEvent = { type: string; [k: string]: unknown };

function collectUntilTraceEnd(timeoutMs = 25000): Promise<AnyEvent[]> {
  return new Promise((resolve, reject) => {
    const events: AnyEvent[] = [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout; saw: ${events.map((e) => e.type).join(",")}`));
    }, timeoutMs);
    (async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/events`, { signal: ctrl.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5)) as AnyEvent;
          events.push(event);
          if (event.type === "trace.end") {
            clearTimeout(timer);
            ctrl.abort();
            resolve(events);
            return;
          }
        }
      }
    })().catch((e) => {
      if (!ctrl.signal.aborted) {
        clearTimeout(timer);
        reject(e);
      }
    });
  });
}

const run = runAgent("support");
await waitForHealth();
const events = await collectUntilTraceEnd();
await run.catch(() => {});

const tools = events.filter((e) => e.type === "tool.end") as Array<AnyEvent & { toolName: string; status: string }>;
const summary = tools.map((t) => `${t.toolName}:${t.status}`);
console.log("tool.end sequence:", summary.join("  →  "));

const refunds = tools.filter((t) => t.toolName === "issue_refund");
const ok =
  events.some((e) => e.type === "trace.start") &&
  tools.some((t) => t.toolName === "lookup_order" && t.status === "ok") &&
  refunds.length === 2 &&
  refunds.some((t) => t.status === "error") &&
  refunds.some((t) => t.status === "ok") &&
  tools.some((t) => t.toolName === "send_email" && t.status === "ok") &&
  events.some((e) => e.type === "trace.end");

if (!ok) {
  console.error("✗ unexpected event stream:", events.map((e) => e.type).join(","));
  process.exit(1);
}
console.log(`✓ live cascade verified — ${events.length} HUD events streamed, refund failed then recovered`);
process.exit(0);
