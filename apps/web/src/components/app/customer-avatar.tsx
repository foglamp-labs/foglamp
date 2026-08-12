"use client";

import { IconUser, IconUserFilled } from "@tabler/icons-react";
import { useState } from "react";

import { agentColor } from "@/components/app/agent-icon";
import { cn } from "@/lib/utils";

/**
 * A customer's avatar: their `imageUrl` when present, else a user glyph tinted
 * with a reproducible color derived from the customer id (same hashing as
 * `AgentIcon`, so a customer always gets the same color). `filled` opts into the
 * solid glyph (matching `AgentIcon`'s treatment). The image renders as a plain
 * `<img>` (no Next image optimizer) so customer-supplied URLs are never fetched
 * server-side; a broken URL falls back to the tinted glyph.
 */
export function CustomerAvatar({
	customerId,
	customerName,
	imageUrl,
	filled = false,
	className,
}: {
	customerId: string;
	customerName?: string | null;
	imageUrl?: string | null;
	filled?: boolean;
	className?: string;
}) {
	const [broken, setBroken] = useState(false);
	if (imageUrl && !broken) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- customer-supplied URL, no optimization/server fetch wanted
			<img
				src={imageUrl}
				alt={customerName ?? customerId}
				referrerPolicy="no-referrer"
				loading="lazy"
				onError={() => setBroken(true)}
				className={cn("size-4 shrink-0 rounded-full object-cover", className)}
			/>
		);
	}
	const Icon = filled ? IconUserFilled : IconUser;
	return (
		<Icon
			className={cn("size-4 shrink-0", className)}
			style={{ color: agentColor(customerId) }}
		/>
	);
}
