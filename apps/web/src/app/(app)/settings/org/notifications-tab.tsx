"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { Switch } from "@foglamp/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

/** Per-user notification preferences: one weekly digest toggle per org. */
export function NotificationsTab() {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery(trpc.notifications.list.queryOptions());
	const update = useMutation(
		trpc.notifications.setWeeklyDigest.mutationOptions({
			onSuccess: () => {
				void qc.invalidateQueries({
					queryKey: trpc.notifications.list.queryKey(),
				});
			},
			onError: (e) => toast.error(e.message ?? "Failed to update preference"),
		}),
	);

	return (
		<Card className="data-[size=sm]:pb-3" size="sm">
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<CardDescription>
					Every Monday, one weekly digest email per organization with last
					week's spans, cost, errors and latency for each project. Owners and
					admins receive it by default.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col">
				{isLoading && (
					<div className="py-3 text-sm text-muted-foreground">Loading…</div>
				)}
				{data?.length === 0 && (
					<div className="py-3 text-sm text-muted-foreground">
						You are not a member of any organization.
					</div>
				)}
				{data?.map((row) => (
					<div
						key={row.orgId}
						className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-b-0 px-0.5 pr-2"
					>
						<div className="min-w-0">
							<div className="truncate text-sm font-medium">{row.orgName}</div>
							<div className="text-xs text-muted-foreground capitalize">
								{row.role}
							</div>
						</div>
						<Switch
							size="sm"
							checked={row.weeklyDigest}
							disabled={
								update.isPending && update.variables?.orgId === row.orgId
							}
							onCheckedChange={(checked) =>
								update.mutate({ orgId: row.orgId, enabled: checked })
							}
							aria-label={`Weekly digest for ${row.orgName}`}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
