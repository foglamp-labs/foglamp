import { RouteHeader } from "@/components/app/route-header";

// The real title is the workflow name (a route param loading.tsx can't see),
// so the fallback shows the generic crumb until the page streams in.
export default function Loading() {
	return <RouteHeader href="/workflows" back title="Workflow" withRange />;
}
