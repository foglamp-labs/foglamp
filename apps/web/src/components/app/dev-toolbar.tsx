"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Dev settings store
// ---------------------------------------------------------------------------
// A tiny localStorage-backed store (rather than context) so any component can
// subscribe to a dev setting without threading providers through the tree.
// Everything here is dev-only: in production the hooks return the default and
// the toolbar renders nothing.

const DEV = process.env.NODE_ENV === "development";

/** How the sidebar nav icons render: the current colored chip (background +
 * shadow) or just the colored glyph. */
export type NavIconVariant = "chip" | "simple";

const NAV_ICON_KEY = "foglamp:dev:nav-icon-variant";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function readNavIconVariant(): NavIconVariant {
	if (typeof window === "undefined") return "chip";
	return window.localStorage.getItem(NAV_ICON_KEY) === "simple"
		? "simple"
		: "chip";
}

function setNavIconVariant(variant: NavIconVariant) {
	// The default is absence, so a stale key never leaks into a fresh state.
	if (variant === "simple") window.localStorage.setItem(NAV_ICON_KEY, "simple");
	else window.localStorage.removeItem(NAV_ICON_KEY);
	for (const listener of listeners) listener();
}

/** The active nav-icon variant. Always "chip" outside development. */
export function useNavIconVariant(): NavIconVariant {
	const variant = useSyncExternalStore(
		subscribe,
		readNavIconVariant,
		() => "chip" as const,
	);
	return DEV ? variant : "chip";
}

/** How an LLM bar renders its pre-first-token stretch in the waterfall. */
export type TtftVariant =
	| "dashed"
	| "stripes"
	| "faded"
	| "thin"
	| "gap"
	| "dots";

export const TTFT_VARIANTS: { value: TtftVariant; label: string }[] = [
	{ value: "dashed", label: "Dashed" },
	{ value: "stripes", label: "Stripes" },
	{ value: "faded", label: "Faded" },
	{ value: "thin", label: "Thin" },
	{ value: "gap", label: "Gap" },
	{ value: "dots", label: "Dots" },
];

const TTFT_KEY = "foglamp:dev:ttft-variant";
const TTFT_DEFAULT: TtftVariant = "dashed";

function readTtftVariant(): TtftVariant {
	if (typeof window === "undefined") return TTFT_DEFAULT;
	const v = window.localStorage.getItem(TTFT_KEY);
	return TTFT_VARIANTS.some((o) => o.value === v)
		? (v as TtftVariant)
		: TTFT_DEFAULT;
}

function setTtftVariant(variant: TtftVariant) {
	// The default is absence, so a stale key never leaks into a fresh state.
	if (variant === TTFT_DEFAULT) window.localStorage.removeItem(TTFT_KEY);
	else window.localStorage.setItem(TTFT_KEY, variant);
	for (const listener of listeners) listener();
}

/** The active TTFT-wait rendering. Always the default outside development. */
export function useTtftVariant(): TtftVariant {
	const variant = useSyncExternalStore(
		subscribe,
		readTtftVariant,
		() => TTFT_DEFAULT,
	);
	return DEV ? variant : TTFT_DEFAULT;
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

/** Development-only toolbar pinned to the center-right screen edge: a slim
 * handle that expands into a panel of design/dev toggles. Hideable (until the
 * next reload) via its close button. Renders nothing in production. */
export function DevToolbar() {
	if (!DEV) return null;
	return <DevToolbarInner />;
}

function DevToolbarInner() {
	const [open, setOpen] = useState(false);
	// Session-only: reappears on reload, so there's no way to lose the toolbar.
	const [hidden, setHidden] = useState(false);
	const variant = useNavIconVariant();
	const ttft = useTtftVariant();

	if (hidden) return null;

	return (
		<div className="fixed top-1/2 right-0 z-50 -translate-y-1/2">
			{open ? (
				<div className="w-60 rounded-l-2xl border border-r-0 bg-background p-3 shadow-xl">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Dev
						</span>
						<div className="flex items-center gap-0.5">
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="Collapse dev toolbar"
								onClick={() => setOpen(false)}
							>
								<IconChevronRight />
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="Hide dev toolbar until reload"
								onClick={() => setHidden(true)}
							>
								<IconX />
							</Button>
						</div>
					</div>

					<div className="flex items-center justify-between gap-3">
						<span className="text-sm">Sidebar icons</span>
						<div className="flex rounded-full bg-muted p-0.5">
							{(
								[
									{ value: "chip", label: "Chips" },
									{ value: "simple", label: "Simple" },
								] as const
							).map((o) => (
								<button
									key={o.value}
									type="button"
									aria-pressed={variant === o.value}
									onClick={() => setNavIconVariant(o.value)}
									className={cn(
										"cursor-pointer rounded-full px-2.5 py-1 text-xs",
										variant === o.value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{o.label}
								</button>
							))}
						</div>
					</div>

					{/* Pre-first-token bar rendering on the trace waterfall. */}
					<div className="mt-3 flex flex-col gap-1.5">
						<span className="text-sm">TTFT wait</span>
						<div className="flex flex-wrap gap-1">
							{TTFT_VARIANTS.map((o) => (
								<button
									key={o.value}
									type="button"
									aria-pressed={ttft === o.value}
									onClick={() => setTtftVariant(o.value)}
									className={cn(
										"cursor-pointer rounded-full px-2.5 py-1 text-xs",
										ttft === o.value
											? "bg-muted text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{o.label}
								</button>
							))}
						</div>
					</div>
				</div>
			) : (
				<button
					type="button"
					aria-label="Open dev toolbar"
					onClick={() => setOpen(true)}
					className="flex cursor-pointer items-center rounded-l-lg border border-r-0 bg-background py-3 pl-0.5 pr-1 text-muted-foreground shadow-md transition-colors hover:text-foreground"
				>
					<IconChevronLeft className="size-3.5" />
				</button>
			)}
		</div>
	);
}
