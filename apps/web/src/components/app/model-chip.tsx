import { IconCpu } from "@tabler/icons-react";

import { ContextChip } from "@/components/app/context-chip";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import { cn } from "@/lib/utils";

export type ChipModel = { modelId: string; provider: string | null };

/**
 * Static context chip for the model(s) a session or trace ran on. One model
 * shows its logo and display name; several overlap their logos (first-use
 * order, capped at three) and read "n models" with the full list in the title.
 */
export function ModelChip({ models }: { models: ChipModel[] }) {
	if (models.length === 0) return null;
	const only = models[0];
	if (models.length === 1 && only) {
		return (
			<ContextChip
				icon={(p) => (
					<ModelLogo
						provider={only.provider}
						modelId={only.modelId}
						className={p.className}
					/>
				)}
				iconClassName=""
				label={formatModelName(only.modelId)}
			/>
		);
	}
	const shown = models.slice(0, 3);
	return (
		<span title={models.map((m) => formatModelName(m.modelId)).join(", ")}>
			<ContextChip
				icon={(p) => (
					<span className={cn("flex items-center -space-x-1.5", p.className)}>
						{shown.map((m) => (
							<span
								key={m.modelId}
								className="flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-card"
							>
								<ModelLogo
									provider={m.provider}
									modelId={m.modelId}
									className="size-3"
								/>
							</span>
						))}
						{models.length > shown.length && (
							<IconCpu className="size-3 text-muted-foreground" />
						)}
					</span>
				)}
				iconClassName="w-auto"
				label={`${models.length} models`}
			/>
		</span>
	);
}
