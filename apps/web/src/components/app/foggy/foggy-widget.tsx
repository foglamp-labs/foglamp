"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertHexagonFilled,
  IconArrowUp,
  IconError404,
  IconMessage,
  IconMessageFilled,
  IconPacmanFilled,
  IconPlus,
  IconSparklesFilled,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { TextShimmerLoader } from "@foglamp/ui/components/loader";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@foglamp/ui/components/sheet";
import { cn } from "@foglamp/ui/lib/utils";

import { FoggyMessage } from "./foggy-message";

// The transport throws with the response body in `error.message`. Our server
// errors are JSON `{ error }`, so surface that reason when we can (e.g. "Foggy
// isn't configured", rate-limit messages) and fall back to a generic line.
function errorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return "Foggy hit a snag. Please try again in a moment.";
}

const SUGGESTIONS = [
  "What did I spend in the last 7 days?",
  "Show me my slowest traces",
  "Which model costs the most?",
  "How do I name a workflow?",
];

export function FoggyWidget({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Whether the message list is scrolled away from the top — gates the top fade.
  const [scrolled, setScrolled] = useState(false);

  // A stable id for the current conversation, sent to the server so each chat
  // becomes its own foglamp session. Regenerated on "new chat" (below) and on a
  // project switch (the parent keys this component by projectId, remounting it).
  // Not rendered to the DOM, so generating it during render is hydration-safe.
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  // One transport per project + conversation; a new threadId resets the body.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.NEXT_PUBLIC_SERVER_URL}/foggy`,
        credentials: "include",
        body: { projectId, threadId },
      }),
    [projectId, threadId]
  );

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // Reset to a fresh conversation — new threadId → new foglamp session.
  function newChat() {
    if (busy) void stop();
    setMessages([]);
    setInput("");
    setScrolled(false);
    setThreadId(crypto.randomUUID());
  }

  // Show the shimmer while we're waiting for (or tool-calling toward) a reply —
  // i.e. until the assistant actually starts emitting text.
  const last = messages[messages.length - 1];
  const replyStarted =
    last?.role === "assistant" &&
    last.parts.some((p) => p.type === "text" && p.text.length > 0);
  const thinking = busy && !replyStarted;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <>
      {/* Floating launcher — bottom-right, hidden while the sheet is open. */}
      <Button
        type="button"
        size="icon-lg"
        onClick={() => setOpen(true)}
        aria-label="Ask Foggy"
        variant="secondary"
        className={cn(
          "fixed bottom-6 right-6 z-30 size-10 rounded-full dark:hover:bg-[#0F283F] hover:bg-blue-100 shadow-(--custom-shadow) transition-all",
          open && "pointer-events-none scale-90 opacity-0"
        )}
      >
        <IconPacmanFilled className="size-5 text-[#0090FD]" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          variant="floating"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg sm:min-w-lg"
        >
          <SheetHeader className="flex-row items-center justify-between gap-2 p-4">
            <div className="flex flex-col gap-0.5 pl-1">
              {messages.length > 0 && (
                <div className="flex gap-2 items-center">
                  <IconPacmanFilled className="text-[#0090FD] size-4 mb-px" />
                  Foggy
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <AnimatePresence initial={false}>
                {messages.length > 0 && (
                  <motion.div
                    key="new-chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={newChat}
                      aria-label="New chat"
                      title="New chat"
                    >
                      <IconPlus className="size-4" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <IconX className="size-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="relative min-h-0 flex-1">
            {/* Fade + blur the first messages out behind the header, but only
                once the list is scrolled (mirrors the bottom fade). */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-linear-to-b from-popover via-popover/50 to-transparent transition-opacity duration-200",
                scrolled ? "opacity-100" : "opacity-0"
              )}
              style={{
                maskImage: "linear-gradient(to bottom, black 35%, transparent)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 35%, transparent)",
              }}
            />
            <div
              ref={scrollRef}
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
              className="h-full overflow-y-auto px-4 py-4"
            >
              <AnimatePresence mode="wait" initial={false}>
                {messages.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="h-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <Empty className="h-full border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia
                          variant="icon"
                          className="size-10 [&_svg:not([class*='size-'])]:size-5 bg-[#0090FD]/10"
                        >
                          <IconPacmanFilled className="text-[#0090FD] size-6" />
                        </EmptyMedia>
                        <EmptyTitle>Ask Foggy</EmptyTitle>
                        <EmptyDescription>
                          I can dig through this project&apos;s traces, costs,
                          and agents - or explain how Foglamp works.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent className="mt-2 gap-2">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => send(s)}
                            className="w-full rounded-xl corner-squircle bg-card px-3 py-2 cursor-pointer text-left text-sm transition-colors hover:bg-accent flex justify-center items-center gap-2"
                          >
                            <IconMessageFilled className="size-3.5 text-muted-foreground/50" />
                            {s}
                          </button>
                        ))}
                      </EmptyContent>
                    </Empty>
                  </motion.div>
                ) : (
                  <motion.div
                    key="messages"
                    className="flex flex-col gap-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    {messages.map((m) => (
                      <FoggyMessage key={m.id} message={m} />
                    ))}
                    {thinking && (
                      <TextShimmerLoader
                        text="Foggy is thinking…"
                        size="sm"
                        className="pl-4"
                      />
                    )}
                    {error && (
                      <div className="rounded-3xl corner-squircle bg-destructive/10 px-3 ml-3 py-2 text-sm text-destructive w-fit flex gap-2 items-center">
                        <IconAlertHexagonFilled className="size-3.5" />
                        {errorMessage(error)}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-popover via-popover/50 to-transparent"
              style={{
                maskImage: "linear-gradient(to top, black 35%, transparent)",
                WebkitMaskImage:
                  "linear-gradient(to top, black 35%, transparent)",
              }}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 p-3 pt-0 relative"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="Ask Foggy…"
              className="max-h-32 flex-1 resize-none rounded-4xl corner-squircle shadow-(--custom-shadow) bg-muted p-4 text-sm outline-none transition-colors focus-visible:border-ring"
            />
            {busy ? (
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                onClick={() => void stop()}
                aria-label="Stop"
              >
                <span className="size-2.5 rounded-[2px] bg-current absolute right-6 bottom-6" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-xs"
                disabled={!input.trim()}
                aria-label="Send"
                className="absolute right-6 bottom-6"
              >
                <IconArrowUp className="size-4" />
              </Button>
            )}
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
