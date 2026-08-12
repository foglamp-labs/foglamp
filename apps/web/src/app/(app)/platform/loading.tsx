import { RouteHeader } from "@/components/app/route-header";

// Title only: the description (and an access-denied variant) depends on the
// isAdmin probe, so the fallback stays neutral.
export default function Loading() {
	return <RouteHeader href="/platform" title="Platform" />;
}
