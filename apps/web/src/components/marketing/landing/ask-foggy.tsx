"use client";

import { useChat } from "@ai-sdk/react";
import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import { TextShimmerLoader } from "@foglamp/ui/components/loader";
import { cn } from "@foglamp/ui/lib/utils";
import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

import { FoggyMessage } from "@/components/app/foggy/foggy-message";

// The public Foggy under the FAQ. Same assistant as the one in the app, with
// only the docs tool, no login, no history. The server rate-limits by IP and
// caps total daily use, so this is safe to leave on the front page.

const SUGGESTIONS = [
	"How do I name an agent?",
	"Does it work with streamText?",
	"What does self-hosting need?",
	"How do evals get scored?",
];

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
		[],
	);
	const { messages, sendMessage, status, error, stop } = useChat({ transport });
	const busy = status === "submitted" || status === "streaming";
	const lastIsAssistant = messages.at(-1)?.role === "assistant";
	const thinking = status === "submitted" || (busy && !lastIsAssistant);

	function ask(text: string) {
		const q = text.trim();
		if (!q || busy) return;
		void sendMessage({ text: q });
		setInput("");
	}

	return (
		<div className="mt-10">
			<div className="flex items-center gap-4">
				<span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
					Ask Foggy
				</span>
				<span aria-hidden className="h-px flex-1 bg-border/70" />
			</div>

			{messages.length > 0 && (
				<div className="mt-6 flex flex-col gap-5">
					{messages.map((m) => (
						<FoggyMessage key={m.id} message={m} />
					))}
					{thinking && <TextShimmerLoader text="Foggy is reading the docs" size="sm" />}
					{error && (
						<p className="text-sm text-destructive">{errorMessage(error)}</p>
					)}
				</div>
			)}

			<form
				className="mt-6 flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					ask(input);
				}}
			>
				<label htmlFor="ask-foggy" className="sr-only">
					Ask Foggy a question about Foglamp
				</label>
				<input
					id="ask-foggy"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask anything about Foglamp"
					maxLength={600}
					autoComplete="off"
					className="h-10 min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus-visible:ring-ring"
				/>
				{busy ? (
					<Button
						type="button"
						size="icon"
						variant="secondary"
						aria-label="Stop"
						className="size-10 rounded-full"
						onClick={() => void stop()}
					>
						<IconPlayerStopFilled className="size-3.5" />
					</Button>
				) : (
					<Button
						type="submit"
						size="icon"
						aria-label="Send"
						className="size-10 rounded-full"
						disabled={!input.trim()}
					>
						<IconArrowUp className="size-4" />
					</Button>
				)}
			</form>

			{messages.length === 0 && (
				<div className="mt-3 flex flex-wrap gap-2">
					{SUGGESTIONS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => ask(s)}
							className={cn(
								"rounded-full px-3 py-1 text-xs text-muted-foreground ring-1 ring-border transition-colors duration-100",
								"hover:bg-muted hover:text-foreground",
							)}
						>
							{s}
						</button>
					))}
				</div>
			)}

			<p className="mt-3 text-xs text-muted-foreground/70">
				Foggy answers from the docs and can be wrong. Nothing you type here is
				saved.
			</p>
		</div>
	);
}
