"use client";

import { Switch } from "@foglamp/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import { NotificationsHeader } from "./header";

export function NotificationsClient() {
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
		<>
			<NotificationsHeader />
			<section className="flex flex-col gap-1 px-6">
				<h2 className="text-sm font-medium">Weekly digest</h2>
				<p className="text-sm text-muted-foreground">
					Every Monday, one email per organization with last week's spans, cost,
					errors and latency for each project. Owners and admins receive it by
					default.
				</p>
				<ul className="mt-4 divide-y rounded-lg border">
					{isLoading && (
						<li className="px-4 py-3 text-sm text-muted-foreground">
							Loading…
						</li>
					)}
					{data?.length === 0 && (
						<li className="px-4 py-3 text-sm text-muted-foreground">
							You are not a member of any organization.
						</li>
					)}
					{data?.map((row) => (
						<li
							key={row.orgId}
							className="flex items-center justify-between gap-4 px-4 py-3"
						>
							<div className="min-w-0">
								<div className="truncate text-sm">{row.orgName}</div>
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
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
