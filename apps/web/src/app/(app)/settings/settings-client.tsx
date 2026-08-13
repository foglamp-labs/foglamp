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
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
} from "@foglamp/ui/components/input-group";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import {
	IconCheckFilled,
	IconCircleCheckFilled,
	IconCircleXFilled,
	IconKeyFilled,
	IconPlusFilled,
	IconTrashFilled,
	IconXFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AnimatedApiKey } from "@/components/app/animated-api-key";
import { CopyIcon } from "@/components/app/copy-icon";
import { useDelayedLoading, useEntranceOnce } from "@/components/app/hooks";
import { EmptyState, TableRowsSkeleton } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useCopied } from "@/components/app/use-copied";
import { trpc } from "@/utils/trpc";
import { cn } from "@foglamp/ui/lib/utils";
import { ApiKeysHeader } from "./header";

export function SettingsClient() {
	const entrance = useEntranceOnce();
	const { projectId } = useProject();
	const qc = useQueryClient();

	// API keys dialog state
	const [keyDialogOpen, setKeyDialogOpen] = useState(false);
	const [keyName, setKeyName] = useState("");
	const [revealedKey, setRevealedKey] = useState<string | null>(null);
	const { copied, markCopied, resetCopied } = useCopied(2000);
	// Key pending revocation (drives the confirm dialog).
	const [revokeTarget, setRevokeTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	// Remembers the name while the confirm dialog animates closed, so the
	// description doesn't flicker to empty before the exit animation finishes.
	const lastRevokeName = useRef("");

	const keys = useQuery({
		...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
		enabled: !!projectId,
	});
	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	// Only the table body waits on data — the column headers paint immediately.
	const showSkeleton = useDelayedLoading(keys.isLoading);

	const createKey = useMutation(
		trpc.projects.keys.create.mutationOptions({
			onSuccess: (data) => {
				qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
				// Keep keyName: it's the text the reveal animation rolls *from*. The
				// dialog state is reset in onOpenChangeComplete once it has closed.
				setRevealedKey(data.key);
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const revoke = useMutation(
		trpc.projects.keys.revoke.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
				setRevokeTarget(null);
				toast.success("API key revoked");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	// Active keys first, then newest-created first within each group.
	const keyRows = useMemo(
		() =>
			[...(keys.data ?? [])].sort((a, b) => {
				const aRevoked = a.revokedAt ? 1 : 0;
				const bRevoked = b.revokedAt ? 1 : 0;
				if (aRevoked !== bRevoked) return aRevoked - bRevoked;
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			}),
		[keys.data],
	);

	// With no keys at all, the create button lives inside the empty state
	// (more discoverable there) instead of the header.
	const noKeys = !keys.isLoading && keyRows.length === 0;

	return (
		<>
			{/* Wrapped here (not inside ApiKeysHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
			<div className={cn(entrance && "page-fade-in")}>
				<ApiKeysHeader
					actions={
						projectId &&
						!noKeys && (
							<Button size="sm" onClick={() => setKeyDialogOpen(true)}>
								<IconPlusFilled /> Create key
							</Button>
						)
					}
				/>
			</div>

			{projectId && (
				<Dialog
					open={keyDialogOpen}
					onOpenChange={setKeyDialogOpen}
					onOpenChangeComplete={(open) => {
						// Reset only after the close animation finishes — resetting on
						// close swaps the revealed view back to the create form mid-exit,
						// causing a layout shift.
						if (!open) {
							setKeyName("");
							setRevealedKey(null);
							resetCopied();
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								{revealedKey ? "API key created" : "Create API key"}
							</DialogTitle>

							<DialogDescription>
								{revealedKey
									? "Copy your key now, it won't be shown again."
									: "Give it a cool name."}
							</DialogDescription>
						</DialogHeader>
						{revealedKey ? (
							<>
								<Field>
									<FieldLabel>API Key:</FieldLabel>
									<InputGroup>
										<div className="flex min-w-0 flex-1 items-center overflow-x-auto px-2.5">
											<AnimatedApiKey from={keyName} value={revealedKey} />
										</div>
										<InputGroupAddon align="inline-end" className="pr-1">
											<Button
												size="icon-sm"
												variant="ghost"
												className="mr-1 rounded-sm size-7"
												onClick={() => {
													void navigator.clipboard.writeText(revealedKey);
													markCopied();
												}}
											>
												<CopyIcon copied={copied} />
											</Button>
										</InputGroupAddon>
									</InputGroup>
								</Field>
								<DialogFooter>
									<Button onClick={() => setKeyDialogOpen(false)}>Done</Button>
								</DialogFooter>
							</>
						) : (
							<>
								<Field>
									<FieldLabel>Name</FieldLabel>
									<Input
										autoFocus
										placeholder="Production key"
										value={keyName}
										onChange={(e) => setKeyName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												if (!keyName.trim()) return;
												createKey.mutate({
													projectId,
													name: keyName.trim(),
												});
											}
										}}
									/>
								</Field>
								<DialogFooter>
									<Button
										disabled={!keyName.trim() || createKey.isPending}
										onClick={() => {
											if (!keyName.trim()) return;
											createKey.mutate({
												projectId,
												name: keyName.trim(),
											});
										}}
									>
										Create
									</Button>
								</DialogFooter>
							</>
						)}
					</DialogContent>
				</Dialog>
			)}

			{!projectId ? (
				<p className="text-sm text-muted-foreground">Select a project first.</p>
			) : (
				<>
					{!keys.isLoading && keyRows.length === 0 ? (
						<div className="px-8">
							<EmptyState
								icon={IconKeyFilled}
								title="No API keys"
								description="Create a key to authenticate SDK requests."
								className={cn(entrance && "page-fade-in")}
							>
								<Button className="mt-2" onClick={() => setKeyDialogOpen(true)}>
									<IconPlusFilled /> Create key
								</Button>
							</EmptyState>
						</div>
					) : (
						// Fixed layout: column widths come from the header's w-* classes,
						// so the skeleton→data swap can't re-measure and shift columns.
						<Table className={cn("table-fixed", entrance && "page-fade-in")}>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead className="w-44">Status</TableHead>
									<TableHead className="w-44">Last used</TableHead>
									<TableHead className="w-44">Created</TableHead>
									<TableHead className="w-28" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys.isLoading ? (
									showSkeleton ? (
										<TableRowsSkeleton
											cols={KEY_SKELETON_COLS}
											rowHeight="h-15"
										/>
									) : null
								) : (
									keyRows.map((k) => (
										<TableRow key={k.id}>
											<TableCell className="font-medium flex flex-col gap-0.75 py-2.5">
												{k.name}{" "}
												<span className="font-mono text-[11px] text-muted-foreground/50">
													{k.keyPrefix}
												</span>
											</TableCell>
											<TableCell>
												{k.revokedAt ? (
													<Badge variant="rose">
														<IconXFilled className="mb-px size-3.25" />
														revoked
													</Badge>
												) : (
													<Badge variant="emerald">
														<IconCheckFilled className="mb-px size-3.25" />
														active
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{k.lastUsedAt
													? formatDistanceToNow(new Date(k.lastUsedAt), {
															addSuffix: true,
														})
													: "Never"}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDistanceToNow(new Date(k.createdAt), {
													addSuffix: true,
												})}
											</TableCell>
											<TableCell align="right" className="py-0">
												{!k.revokedAt && (
													<Button
														variant="ghost-destructive"
														className="size-7"
														onClick={() => {
															lastRevokeName.current = k.name;
															setRevokeTarget({ id: k.id, name: k.name });
														}}
													>
														<IconTrashFilled />
													</Button>
												)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					)}

					<AlertDialog
						open={revokeTarget !== null}
						onOpenChange={(open) => !open && setRevokeTarget(null)}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Revoke API key?</AlertDialogTitle>
								<AlertDialogDescription>
									{`"${revokeTarget?.name ?? lastRevokeName.current}" will stop working immediately. This can't be undone.`}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={revoke.isPending}
									onClick={() => {
										if (!revokeTarget) return;
										revoke.mutate({ projectId, keyId: revokeTarget.id });
									}}
								>
									Revoke
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}
		</>
	);
}

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const KEY_SKELETON_COLS = [
	{ w: "w-32" },
	{ w: "w-16" },
	{ w: "w-20" },
	{ w: "w-20" },
	{},
] as const;
