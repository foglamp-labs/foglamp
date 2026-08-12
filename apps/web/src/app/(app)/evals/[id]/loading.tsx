import { RouteHeader } from "@/components/app/route-header";

// The real title is the eval's name (fetched data), so the fallback shows the
// generic crumb until the page streams in.
export default function Loading() {
	return <RouteHeader href="/evals" back title="Eval" withRange />;
}
