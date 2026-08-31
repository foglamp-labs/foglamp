import type { Route } from "next";
import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/** Navigation props for a clickable table row. Rows navigate with
 * router.push, which (unlike a rendered Link) never prefetches — so in
 * production a click paid a full round trip for the route's RSC payload
 * before anything on screen changed. Prefetching on hover/focus has the
 * payload local by the time the click lands. */
export function rowNav<T extends string>(router: AppRouter, href: Route<T>) {
	const prefetch = () => router.prefetch(href);
	return {
		onClick: () => router.push(href),
		onMouseEnter: prefetch,
		onFocus: prefetch,
	};
}
