"use client";

import {
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@foglamp/ui/components/dropdown-menu";
import { cn } from "@foglamp/ui/lib/utils";
import { IconDeviceLaptop, IconMoon, IconSun } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

// resolvedTheme is undefined during SSR and the first client render. We render a
// stable icon until mounted so the server and client agree; the real icon (and
// the active radio value) only appear once the theme is known on the client.
function useMounted() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted;
}

// Same spring as the SDK-version toggle (instrument-empty-state), so segmented
// controls across the app glide identically.
const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

const THEME_OPTIONS = [
	{ value: "system", label: "System", icon: IconDeviceLaptop },
	{ value: "light", label: "Light", icon: IconSun },
	{ value: "dark", label: "Dark", icon: IconMoon },
] as const;

/**
 * Three-way theme control as a segmented pill (system / light / dark), matching
 * the SDK-version toggle. Switches instantly on click — no menu (used in the
 * marketing footer). The dropdown variant lives in {@link ThemeSubmenu}.
 */
export function ThemeSwitcher() {
	const { theme, setTheme } = useTheme();
	const mounted = useMounted();
	// Unique per instance so the sliding pill is scoped to this control.
	const pillId = useId();

	return (
		<div className="inline-flex  items-center rounded-full p-1 bg-input/20">
			{THEME_OPTIONS.map((opt) => {
				// Track the chosen setting (theme), not the resolved value, so "System"
				// is its own selectable state. Nothing is active until mounted, so the
				// server and first client render agree.
				const active = mounted && theme === opt.value;
				const Icon = opt.icon;
				return (
					<button
						key={opt.value}
						type="button"
						aria-label={opt.label}
						aria-pressed={active}
						onClick={() => setTheme(opt.value)}
						className={cn(
							"relative flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
							active
								? "text-foreground"
								: "text-muted-foreground/60 hover:text-foreground",
						)}
					>
						{active && (
							<motion.span
								layoutId={pillId}
								transition={MORPH}
								className="absolute inset-0 rounded-full bg-muted shadow-(--custom-shadow) dark:bg-input/50"
							/>
						)}
						<Icon className="relative z-10 size-4" />
					</button>
				);
			})}
		</div>
	);
}

/** Theme picker rendered as a submenu item, for use inside another dropdown. */
export function ThemeSubmenu() {
	const { theme, setTheme, resolvedTheme } = useTheme();
	const mounted = useMounted();

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				{mounted && resolvedTheme === "dark" ? <IconMoon /> : <IconSun />}
				Theme
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<DropdownMenuRadioGroup
					value={mounted ? theme : undefined}
					onValueChange={setTheme}
				>
					<DropdownMenuRadioItem value="light">
						<IconSun />
						Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<IconMoon />
						Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<IconDeviceLaptop />
						System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
