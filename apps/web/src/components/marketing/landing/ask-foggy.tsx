"use client";

import { useChat } from "@ai-sdk/react";
import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import { TextShimmerLoader } from "@foglamp/ui/components/loader";
import {
  IconArrowRight,
  IconArrowUp,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import { markdownComponents } from "@/components/app/markdown";

// The last row of the FAQ. It looks like one more question, except the
// question is yours: a bare input where the text would be, a send button where
// the chevron would be, and Foggy's answer streaming in under the hairline,
// styled like an open panel. Same public endpoint as before: docs only, no login, no history,
// rate-limited by IP on the server.

function errorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON, use the generic line
  }
  return "Foggy hit a snag. Please try again in a moment.";
}

export function AskFoggy() {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.NEXT_PUBLIC_SERVER_URL}/foggy/public`,
      }),
    []
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  // Only the latest answer is shown. The question stays in the input above it,
  // so the pair reads like any other row on the list.
  const answer = messages.findLast((m) => m.role === "assistant");
  const answerText =
    answer?.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";
  const thinking = busy && !answerText;

  return (
    <div>
      <form
        // The button is 32px in a 24px line. The negative margin keeps this row
        // the same 64px as the question rows above it.
        className="flex items-center gap-4 border-b border-border/70 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          const q = input.trim();
          if (!q || busy) return;
          void sendMessage({ text: q });
        }}
      >
        <label htmlFor="ask-foggy" className="sr-only">
          Ask Foggy a question about Foglamp
        </label>
        <input
          id="ask-foggy"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything else"
          maxLength={600}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="-my-1"
            aria-label="Stop"
            onClick={() => void stop()}
          >
            <IconPlayerStopFilled />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            className="-my-1"
            aria-label="Send"
            disabled={!input.trim()}
            variant={!input.trim() ? "ghost" : "secondary"}
          >
            <IconArrowRight strokeWidth={3} />
          </Button>
        )}
      </form>

      {/* Always rendered with a floor, so the answer does not push the page
          around when it arrives. Long answers still grow past it. */}
      <div className="min-h-44 pt-5 pb-6 text-[15px] leading-relaxed [&_a]:underline [&_a]:decoration-[0.5px] [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:first:mt-0 *:last:mb-0">
        {thinking && <TextShimmerLoader text="Reading the docs" size="md" />}
        {answerText && (
          <Streamdown
            components={markdownComponents}
            controls={{ table: false }}
          >
            {answerText}
          </Streamdown>
        )}
        {error && <p className="text-destructive">{errorMessage(error)}</p>}
      </div>
    </div>
  );
}
