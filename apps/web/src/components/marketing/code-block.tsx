import { cn } from "@foglamp/ui/lib/utils";
import { Fragment } from "react";

import { CopyButton } from "./copy-button";

// A tiny, dependency-free syntax tinter — enough to make a short TS snippet read
// as code (comments dimmed, strings + keywords tinted) without pulling shiki and
// its SSR weight onto the landing page. Splits each line on a single regex and
// colors the captured groups; everything else is left as plain foreground.
const TOKEN =
	/(\/\/[^\n]*)|("[^"]*"|'[^']*'|`[^`]*`)|\b(import|from|const|export|default|return|new|await)\b/g;

function tintLine(line: string, lineKey: number) {
	if (line.trim().startsWith("//")) {
		return <span className="text-muted-foreground/70 italic">{line}</span>;
	}
	const out: React.ReactNode[] = [];
	let last = 0;
	let m: RegExpExecArray | null;
	TOKEN.lastIndex = 0;
	let i = 0;
	while ((m = TOKEN.exec(line))) {
		if (m.index > last)
			out.push(
				<Fragment key={`${lineKey}-t${i++}`}>
					{line.slice(last, m.index)}
				</Fragment>,
			);
		const [full, comment, str, keyword] = m;
		if (comment)
			out.push(
				<span
					key={`${lineKey}-c${i++}`}
					className="text-muted-foreground/70 italic"
				>
					{comment}
				</span>,
			);
		else if (str)
			out.push(
				<span
					key={`${lineKey}-s${i++}`}
					className="text-emerald-600 dark:text-emerald-400"
				>
					{str}
				</span>,
			);
		else if (keyword)
			out.push(
				<span
					key={`${lineKey}-k${i++}`}
					className="text-violet-600 dark:text-violet-400"
				>
					{keyword}
				</span>,
			);
		last = m.index + full.length;
	}
	if (last < line.length)
		out.push(<Fragment key={`${lineKey}-end`}>{line.slice(last)}</Fragment>);
	return <>{out}</>;
}

export function CodeBlock({
	code,
	filename,
	className,
	copy = true,
}: {
	code: string;
	/** Optional label shown in the window chrome (e.g. "model.ts"). */
	filename?: string;
	className?: string;
	copy?: boolean;
}) {
	const lines = code.split("\n");
	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-lg squircle:rounded-3xl corner-squircle bg-muted/40 font-mono text-sm shadow-(--custom-shadow) dark:bg-muted/20",
				className,
			)}
		>
			<div className="flex items-center gap-2 px-4 py-2.5 shadow-[0_1px_0_0_var(--border)]">
				<span className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-foreground/15" />
					<span className="size-2.5 rounded-full bg-foreground/15" />
					<span className="size-2.5 rounded-full bg-foreground/15" />
				</span>
				{filename && (
					<span className="ml-1 text-xs text-muted-foreground">{filename}</span>
				)}
				{copy && (
					<div className="ml-auto -my-1">
						<CopyButton
							value={code}
							idleLabel=""
							copiedLabel=""
							size="icon-sm"
							variant="ghost"
							withIcon
						/>
					</div>
				)}
			</div>
			<pre className="overflow-x-auto px-4 py-4 leading-relaxed">
				<code>
					{lines.map((line, idx) => (
						<span key={idx} className="block min-h-[1.4em]">
							{tintLine(line, idx)}
						</span>
					))}
				</code>
			</pre>
		</div>
	);
}
