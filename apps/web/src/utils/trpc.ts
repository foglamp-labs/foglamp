import type { AppRouter } from "@foglamp/api/routers/index";
import { env } from "@foglamp/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
	createTRPCClient,
	httpBatchLink,
	TRPCClientError,
	type TRPCLink,
} from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { applyDevNetworkConditions } from "./dev-network";

/** Inferred procedure return types, e.g. RouterOutputs["traces"]["get"]. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: query.invalidate,
				},
			});
		},
	}),
});

// Simulated latency/failures/force-loading from the dev toolbar. A link
// rather than a fetch wrapper so conditions apply per procedure — the batch
// link below merges procedures into one request, and force-loading must be
// able to exempt some procedures (e.g. projects.*) while hanging the rest.
const devNetworkLink: TRPCLink<AppRouter> = () => {
	return ({ next, op }) => {
		if (process.env.NODE_ENV !== "development") return next(op);
		return observable((observer) => {
			let cancelled = false;
			let subscription: { unsubscribe: () => void } | undefined;
			applyDevNetworkConditions(op.path).then(
				() => {
					if (cancelled) return;
					subscription = next(op).subscribe(observer);
				},
				(error) => {
					if (!cancelled) observer.error(TRPCClientError.from(error as Error));
				},
			);
			return () => {
				cancelled = true;
				subscription?.unsubscribe();
			};
		});
	};
};

const trpcClient = createTRPCClient<AppRouter>({
	links: [
		devNetworkLink,
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_SERVER_URL}/trpc`,
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
	client: trpcClient,
	queryClient,
});
