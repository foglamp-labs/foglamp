"use client";

import "slot-text/style.css";

import { useEffect, useState } from "react";
import { chromatic } from "slot-text";
import { SlotText } from "slot-text/react";

import { cn } from "@foglamp/ui/lib/utils";

/**
 * Reveals a freshly-created API key with a "slot machine" roll: it mounts
 * showing the name the user gave the key and then rolls, character by
 * character, into the real key value. slot-text only animates on a *text change
 * after mount* — mounting straight onto the value renders it statically — so the
 * name-then-value two-step is what produces the roll.
 *
 * The full key is always exposed via `aria-label` for screen readers, and
 * callers copy from the source string — never from the animated DOM, whose
 * hidden sizers would scramble a manual selection.
 */
export function AnimatedApiKey({
	from,
	value,
	className,
}: {
	/** The text the roll starts from — the name the user gave the key. */
	from: string;
	/** The real key value the roll lands on. */
	value: string;
	className?: string;
}) {
	const [text, setText] = useState(from);

	useEffect(() => {
		// Reset to the name, then flip to the real key on the next frame so the
		// change lands as an animated roll rather than a static rebuild.
		setText(from);
		const id = requestAnimationFrame(() => setText(value));
		return () => cancelAnimationFrame(id);
	}, [from, value]);

	return (
		<SlotText
			text={text}
			aria-label={value}
			options={{
				direction: "down",
				stagger: 15,
				duration: 220,
				bounce: 0,
				easing: "cubic-bezier(0.22, 1, 0.36, 1)",
				color: chromatic({ from: 360 }),
				skipUnchanged: false,
			}}
			className={cn("font-mono text-xs text-foreground", className)}
		/>
	);
}
