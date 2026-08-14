"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangle,
	IconChevronDown,
	IconChevronRight,
	IconPaperclip,
	IconTool,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import { useShikiHtml } from "./code-block";
import { markdownComponents } from "./markdown";
import {
	type Message,
	type Part,
	toMessages,
	unchangedPrefix,
} from "./payload-messages";

// Renders a span/trace input or output payload readably instead of as raw JSON.
// The normalization lives in ./payload-messages (and is tested there); this file
// is only the rendering: text as markdown, tool traffic behind a disclosure,
// anything unrecognized as a JSON block.

function stringify(data: unknown): string {
	try {
		return JSON.stringify(data, null, 2);
	} catch {
		return String(data);
	}
}

// A scrollable raw-JSON block with Shiki syntax highlighting (shares the lazy
// singleton highlighter with CodeBlock). Until the async highlighter resolves —
// or if it fails — the plain text renders as a fallback so there's never an
// empty flash. `className` styles the outer container (border/bg/rounding); the
// highlighted `<pre>` is made transparent so that container shows through.
function JsonBlock({
	data,
	className,
}: {
	data: unknown;
	className?: string;
}) {
	const code = stringify(data);
	const html = useShikiHtml(code, "json");
	const base = "max-h-56 overflow-x-hidden overflow-y-auto p-2 text-xs";
	if (!html) {
		return (
			<pre className={cn(base, "whitespace-pre-wrap wrap-anywhere", className)}>
				{code}
			</pre>
		);
	}
	return (
		<div
			className={cn(
				base,
				"[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
				className,
			)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

// Prose wrapper matching the chat transcript spacing, so markdown reads the
// same here as in sessions / Foggy.
function Prose({ children }: { children: string }) {
	return (
		<div className="text-sm leading-relaxed text-balance wrap-anywhere [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:whitespace-pre-wrap [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child]:mt-0">
			<Streamdown components={markdownComponents} controls={{ table: false }}>
				{children}
			</Streamdown>
		</div>
	);
}

function ToolPart({
	kind,
	name,
	data,
}: {
	kind: "tool-call" | "tool-result" | "tool-error";
	name: string;
	data: unknown;
}) {
	// A failed call opens by default: the error is the reason you're reading this.
	const failed = kind === "tool-error";
	const [open, setOpen] = useState(failed);
	const label = kind === "tool-call" ? "calls" : failed ? "failed" : "returns";
	return (
		<div
			className={cn(
				"rounded-lg border bg-background/50",
				failed ? "border-rose-500/40 bg-rose-500/5" : "border-border/60",
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors",
					failed
						? "text-rose-600 dark:text-rose-400"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<IconChevronRight
					className={cn(
						"size-3.5 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				{failed ? (
					<IconAlertTriangle className="size-3.5 shrink-0" />
				) : (
					<IconTool className="size-3.5 shrink-0" />
				)}
				<span className={cn(!failed && "text-muted-foreground/70")}>
					{label}
				</span>
				<span
					className={cn(
						"truncate font-medium",
						failed ? "text-rose-600 dark:text-rose-400" : "text-foreground",
					)}
				>
					{name}
				</span>
			</button>
			{open && (
				<JsonBlock
					data={data}
					className={cn(
						"border-t",
						failed ? "border-rose-500/30" : "border-border/60",
					)}
				/>
			)}
		</div>
	);
}

/** Attachments arrive as base64 blobs. Rendering the bytes is never useful and
 * inlining megabytes of them wrecks the panel, so only the descriptors show. */
function FilePart({
	mediaType,
	filename,
}: {
	mediaType: string | null;
	filename: string | null;
}) {
	return (
		<div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-xs text-muted-foreground">
			<IconPaperclip className="size-3.5 shrink-0" />
			<span className="truncate font-medium text-foreground">
				{filename ?? "attachment"}
			</span>
			{mediaType && <span className="shrink-0">{mediaType}</span>}
		</div>
	);
}

function PartView({ part }: { part: Part }) {
	switch (part.kind) {
		case "text":
			return part.text.trim() ? <Prose>{part.text}</Prose> : null;
		case "reasoning":
			// Thinking, set apart from the answer — otherwise a model's scratch work
			// reads as the thing it actually said.
			return part.text.trim() ? (
				<div className="border-l-2 border-border pl-3 text-muted-foreground italic">
					<Prose>{part.text}</Prose>
				</div>
			) : null;
		case "tool-call":
		case "tool-result":
		case "tool-error":
			return <ToolPart kind={part.kind} name={part.name} data={part.data} />;
		case "file":
			return <FilePart mediaType={part.mediaType} filename={part.filename} />;
		default:
			return <JsonBlock data={part.data} className="rounded-lg bg-muted" />;
	}
}

// Past this, a message is clamped behind a "Show more". Sized so a normal
// exchange never clamps but a 40k-token system prompt can't blow out the
// 420px-wide trace inspector.
const CLAMP_HEIGHT = 240;

function MessageBlock({ message }: { message: Message }) {
	// System prompts are long, static, and almost never what you opened the panel
	// for — start them folded.
	const [expanded, setExpanded] = useState(message.role !== "system");
	const body = (
		<div className="flex flex-col gap-1.5">
			{message.parts.map((part, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
				<PartView key={i} part={part} />
			))}
		</div>
	);
	return (
		<div className="flex flex-col gap-1.5">
			{message.role && (
				<button
					type="button"
					onClick={() => setExpanded((e) => !e)}
					className="flex cursor-pointer items-center gap-1 self-start text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
				>
					<IconChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							expanded && "rotate-90",
						)}
					/>
					{message.role}
				</button>
			)}
			{expanded && <ClampedBody>{body}</ClampedBody>}
		</div>
	);
}

/** Caps its content's height behind a "Show more". Without this a single 40k-token
 * system prompt renders in full and buries every message after it. */
function ClampedBody({ children }: { children: React.ReactNode }) {
	const [full, setFull] = useState(false);
	const [clamped, setClamped] = useState(false);
	const [inner, setInner] = useState<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!inner) return;
		// Markdown and syntax highlighting both resolve asynchronously, so the
		// content's height isn't final on mount — watch it instead of measuring once.
		const check = () => setClamped(inner.scrollHeight > CLAMP_HEIGHT + 8);
		check();
		const observer = new ResizeObserver(check);
		observer.observe(inner);
		return () => observer.disconnect();
	}, [inner]);
	return (
		<div className="flex flex-col gap-1">
			<div
				className="overflow-hidden"
				style={full ? undefined : { maxHeight: CLAMP_HEIGHT }}
			>
				<div ref={setInner}>{children}</div>
			</div>
			{clamped && (
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="mt-3 w-full text-muted-foreground hover:text-foreground"
					onClick={() => setFull((f) => !f)}
				>
					{/* text-current opts out of the Button variant's default icon
					    tint, which would otherwise disagree with the label color. */}
					<IconChevronDown
						className={cn("size-3.5 text-current", full && "rotate-180")}
					/>
					{full ? "Show less" : "Show more"}
				</Button>
			)}
		</div>
	);
}

export function PayloadView({
	value,
	previousValue,
	className,
}: {
	value: string;
	/** The equivalent payload from the previous LLM call in the same trace.
	 * When it's an exact message-prefix of `value` (agent inputs grow by
	 * appending), the unchanged messages fold away and only the new ones
	 * render — re-scanning 30 repeated messages per step is the main cost of
	 * reading an agent loop. Anything else (edited history, unparseable
	 * payloads) falls back to the full view, so the delta never lies. */
	previousValue?: string | null;
	className?: string;
}) {
	const { messages, shared } = useMemo(() => {
		const messages = toMessages(value);
		if (!messages || !previousValue) return { messages, shared: 0 };
		const prev = toMessages(previousValue);
		if (!prev) return { messages, shared: 0 };
		return { messages, shared: unchangedPrefix(messages, prev) };
	}, [value, previousValue]);
	const [showEarlier, setShowEarlier] = useState(false);
	// The component instance survives span switches — fold back down for each
	// new payload.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the reset trigger, not a used value
	useEffect(() => setShowEarlier(false), [value]);
	if (!messages) {
		// Not JSON — a plain (markdown) answer, or a payload truncated at the
		// storage cap. Either way the raw string is the honest thing to show.
		return (
			<div className={className}>
				<ClampedBody>
					<Prose>{value}</Prose>
				</ClampedBody>
			</div>
		);
	}
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{shared > 0 && (
				<button
					type="button"
					onClick={() => setShowEarlier((s) => !s)}
					className="flex cursor-pointer items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<IconChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							showEarlier && "rotate-90",
						)}
					/>
					{shared} earlier {shared === 1 ? "message" : "messages"} · unchanged
					from the previous call
				</button>
			)}
			{(showEarlier ? messages.slice(0, shared) : []).map((message, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: messages are positional and static
				<MessageBlock key={i} message={message} />
			))}
			{shared > 0 && showEarlier && (
				<div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
					<span className="h-px flex-1 bg-border" />
					new in this call
					<span className="h-px flex-1 bg-border" />
				</div>
			)}
			{messages.slice(shared).map((message, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: messages are positional and static
				<MessageBlock key={shared + i} message={message} />
			))}
		</div>
	);
}
