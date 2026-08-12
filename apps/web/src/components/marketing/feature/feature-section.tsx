import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { IconCheck } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

export type FeatureSectionProps = {
	eyebrow?: string;
	title: string;
	description: string;
	bullets?: string[];
	/** Page-owned visual (chart, flow, code, …). */
	visual: React.ReactNode;
	/** Which side the visual sits on at desktop; alternate down the page. */
	visualPosition?: "right" | "left";
	primaryCta?: { label: string; href: string };
	secondaryCta?: { label: string; href: string };
	/** Full Tailwind text-color class for the eyebrow + bullet checks. */
	accentClassName?: string;
};

export function FeatureSection({
	eyebrow,
	title,
	description,
	bullets,
	visual,
	visualPosition = "right",
	primaryCta,
	secondaryCta,
	accentClassName = "text-foreground",
}: FeatureSectionProps) {
	return (
		<section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
			<div
				className={cn(
					"flex flex-col gap-5",
					visualPosition === "left" && "lg:order-2",
				)}
			>
				{eyebrow && (
					<span
						className={cn(
							"text-sm font-semibold tracking-wide uppercase",
							accentClassName,
						)}
					>
						{eyebrow}
					</span>
				)}
				<h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
					{title}
				</h2>
				<p className="text-lg text-muted-foreground text-pretty">
					{description}
				</p>

				{bullets && bullets.length > 0 && (
					<ul className="flex flex-col gap-3">
						{bullets.map((b) => (
							<li key={b} className="flex items-start gap-2.5 text-sm">
								<IconCheck
									className={cn("mt-0.5 size-4 shrink-0", accentClassName)}
								/>
								<span className="text-foreground/90">{b}</span>
							</li>
						))}
					</ul>
				)}

				{(primaryCta || secondaryCta) && (
					<div className="mt-2 flex flex-wrap gap-3">
						{primaryCta && (
							<Button render={<Link href={primaryCta.href as Route} />}>
								{primaryCta.label}
							</Button>
						)}
						{secondaryCta && (
							<Button
								variant="outline"
								render={<Link href={secondaryCta.href as Route} />}
							>
								{secondaryCta.label}
							</Button>
						)}
					</div>
				)}
			</div>

			<div className={cn(visualPosition === "left" && "lg:order-1")}>
				{visual}
			</div>
		</section>
	);
}
