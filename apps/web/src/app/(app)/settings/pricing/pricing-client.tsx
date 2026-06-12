"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@foglamp/ui/components/alert-dialog";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import {
	IconCoin,
	IconCoinFilled,
	IconPlus,
	IconTrash,
	IconTrashFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useDelayedLoading } from "@/components/app/data-table";
import {
	EmptyState,
	NoProject,
	PageHeader,
	TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatDateTime } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { PricingHeader } from "./header";

// The eight OpenRouter price dimensions, in display order. Prompt/completion
// lead (the common case); the rest are optional and fall back to OpenRouter
// when left blank. `unit` clarifies what the per-X price applies to.
const PRICE_FIELDS = [
	{
		key: "promptPrice",
		label: "Prompt",
		unit: "per token",
		placeholder: "0.00000015",
	},
	{
		key: "completionPrice",
		label: "Completion",
		unit: "per token",
		placeholder: "0.0000006",
	},
	{
		key: "cacheReadPrice",
		label: "Cache read",
		unit: "per token",
		placeholder: "0.000000075",
	},
	{
		key: "cacheWritePrice",
		label: "Cache write",
		unit: "per token",
		placeholder: "0.0000003",
	},
	{
		key: "internalReasoningPrice",
		label: "Reasoning",
		unit: "per token",
		placeholder: "0.0000006",
	},
	{
		key: "requestPrice",
		label: "Per request",
		unit: "per request",
		placeholder: "0.001",
	},
	{
		key: "imagePrice",
		label: "Image",
		unit: "per image",
		placeholder: "0.001",
	},
	{
		key: "webSearchPrice",
		label: "Web search",
		unit: "per call",
		placeholder: "0.004",
	},
] as const;

type PriceKey = (typeof PRICE_FIELDS)[number]["key"];

// Per-token prices are tiny (e.g. 1.5e-7); `formatCost` caps at 6 decimals and
// would collapse them to "$0.00", so render the full value faithfully here.
function formatPrice(value: number) {
	return `$${value.toLocaleString("en-US", { maximumFractionDigits: 12 })}`;
}

export function PricingClient() {
	const { projectId } = useProject();
	const qc = useQueryClient();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [modelPattern, setModelPattern] = useState("");
	const [prices, setPrices] = useState<Partial<Record<PriceKey, string>>>({});
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		modelPattern: string;
	} | null>(null);
	const setPrice = (key: PriceKey, value: string) =>
		setPrices((p) => ({ ...p, [key]: value }));
	const hasAnyPrice = PRICE_FIELDS.some(
		(f) => (prices[f.key] ?? "").trim() !== "",
	);
	// Prices must be non-negative numbers; a negative price would credit usage.
	const hasInvalidPrice = PRICE_FIELDS.some((f) => {
		const v = (prices[f.key] ?? "").trim();
		return v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0);
	});

	const pricing = useQuery({
		...trpc.pricing.list.queryOptions({ projectId: projectId! }),
		enabled: !!projectId,
	});
	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	const showSkeleton = useDelayedLoading(pricing.isLoading);

	const create = useMutation(
		trpc.pricing.create.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.pricing.list.queryKey() });
				setDialogOpen(false);
				setModelPattern("");
				setPrices({});
				toast.success("Pricing override added");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const del = useMutation(
		trpc.pricing.delete.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.pricing.list.queryKey() });
				setDeleteTarget(null);
				toast.success("Pricing override removed");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	if (!projectId) {
		return (
			<>
				<PageHeader
					title="Custom pricing"
					description="Override per-model prices for this project. Unset dimensions fall back to OpenRouter."
				/>
				<NoProject />
			</>
		);
	}

	const rows = pricing.data ?? [];

	const handleSubmit = () => {
		if (!modelPattern.trim() || !hasAnyPrice || hasInvalidPrice) return;
		const dims: Partial<Record<PriceKey, number>> = {};
		for (const f of PRICE_FIELDS) {
			const v = (prices[f.key] ?? "").trim();
			if (v !== "") dims[f.key] = Number(v);
		}
		create.mutate({
			projectId,
			modelPattern: modelPattern.trim(),
			...dims,
		});
	};

	return (
		<>
			<PricingHeader
				actions={
					<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
						<DialogTrigger render={<Button size="sm" />}>
							<IconPlus /> Add override
						</DialogTrigger>
						<DialogContent className="max-h-[85vh] overflow-y-auto">
							<DialogHeader>
								<DialogTitle>Add pricing override</DialogTitle>
								<DialogDescription>
									Set at least one price. Blank dimensions fall back to the
									resolved OpenRouter price.
								</DialogDescription>
							</DialogHeader>
							<Field>
								<FieldLabel>Model pattern</FieldLabel>
								<Input
									autoFocus
									placeholder="openai/gpt-4o-mini"
									value={modelPattern}
									onChange={(e) => setModelPattern(e.target.value)}
								/>
							</Field>
							<div className="grid grid-cols-2 gap-3">
								{PRICE_FIELDS.map((f) => (
									<Field key={f.key}>
										<FieldLabel className="flex items-center gap-1.5">
											{f.label}
											<span className="text-xs font-normal text-muted-foreground">
												{f.unit}
											</span>
										</FieldLabel>
										<Input
											type="number"
											min={0}
											step="any"
											placeholder={f.placeholder}
											value={prices[f.key] ?? ""}
											onChange={(e) => setPrice(f.key, e.target.value)}
										/>
									</Field>
								))}
							</div>
							<DialogFooter>
								<Button
									disabled={
										!modelPattern.trim() ||
										!hasAnyPrice ||
										hasInvalidPrice ||
										create.isPending
									}
									onClick={handleSubmit}
								>
									Add
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				}
			/>

			{pricing.isLoading ? (
				showSkeleton ? (
					<TableSkeleton />
				) : null
			) : rows.length === 0 ? (
				<EmptyState
					icon={IconCoinFilled}
					title="No custom pricing"
					description="Add an override to price models OpenRouter doesn't cover."
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Model pattern</TableHead>
							<TableHead>Prices</TableHead>
							<TableHead>Effective</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => {
							const set = PRICE_FIELDS.filter((f) => r[f.key] != null);
							return (
								<TableRow key={r.id}>
									<TableCell>
										<Badge variant="secondary" className="font-mono">
											{r.modelPattern}
										</Badge>
									</TableCell>
									<TableCell>
										{set.length === 0 ? (
											<span className="text-muted-foreground">—</span>
										) : (
											<div className="flex flex-wrap gap-1.5">
												{set.map((f) => (
													<Badge
														key={f.key}
														variant="secondary"
														className="gap-1 font-normal tabular-nums"
													>
														<span className="text-muted-foreground">
															{f.label}
														</span>
														{formatPrice(r[f.key] as number)}
													</Badge>
												))}
											</div>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDateTime(r.effectiveFrom)}
									</TableCell>
									<TableCell align="center">
										<Button
											size="icon-sm"
											variant="ghost"
											disabled={del.isPending}
											onClick={() =>
												setDeleteTarget({
													id: r.id,
													modelPattern: r.modelPattern,
												})
											}
										>
											<IconTrashFilled />
										</Button>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete the override for {deleteTarget?.modelPattern}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Models matching this pattern fall back to the resolved OpenRouter
							price. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								deleteTarget && del.mutate({ id: deleteTarget.id, projectId })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
