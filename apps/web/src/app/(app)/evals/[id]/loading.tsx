import { Button } from "@foglamp/ui/components/button";
import { IconPencilFilled } from "@tabler/icons-react";

import { Toolbar } from "@/components/app/data-table";
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
			<Toolbar
				className="mt-1 text-xs px-6"
				trailing={
					<>
						<LiveRangePicker />
						<Button variant="secondary" disabled>
							<IconPencilFilled />
							Edit
						</Button>
					</>
				}
			>
				<EvalChipPlaceholders />
			</Toolbar>
		</>
	);
}
