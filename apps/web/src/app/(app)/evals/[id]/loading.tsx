import { Button } from "@foglamp/ui/components/button";
import { IconPencilFilled } from "@tabler/icons-react";

import { LiveRangePicker, RouteHeader } from "@/components/app/route-header";

import { EvalChipPlaceholders } from "./chip-placeholders";

// The real title is the eval's name (fetched data), so the fallback shows the
// generic crumb until the page streams in. The chip row below the crumb is
// painted here too (placeholders + live range picker + disabled Edit) so the
// chrome doesn't shift when the page mounts.
export default function Loading() {
	return (
		<>
			<RouteHeader href="/evals" back title="Eval" />
			<div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs px-7">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<EvalChipPlaceholders />
				</div>
				<div className="flex items-center gap-2">
					<LiveRangePicker />
					<Button variant="secondary" disabled>
						<IconPencilFilled />
						Edit
					</Button>
				</div>
			</div>
		</>
	);
}
