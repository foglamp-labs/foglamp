"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
	/** Text written to the clipboard on click. */
	value: string;
	idleLabel?: string;
	copiedLabel?: string;
	withIcon?: boolean;
	size?: React.ComponentProps<typeof Button>["size"];
	variant?: React.ComponentProps<typeof Button>["variant"];
	className?: string;
};

// A self-contained "copy to clipboard" button with a transient "Copied" state.
// Used for the hero's "Copy the prompt" and the install code block.
export function CopyButton({
	value,
	idleLabel = "Copy",
	copiedLabel = "Copied",
	withIcon = true,
	size = "sm",
	variant = "outline",
	className,
}: CopyButtonProps) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	function copy() {
		void navigator.clipboard?.writeText(value);
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1800);
	}

	return (
		<Button
			type="button"
			size={size}
			variant={variant}
			onClick={copy}
			className={className}
		>
			{withIcon && (copied ? <IconCheck /> : <IconCopy />)}
			{copied ? copiedLabel : idleLabel}
		</Button>
	);
}
