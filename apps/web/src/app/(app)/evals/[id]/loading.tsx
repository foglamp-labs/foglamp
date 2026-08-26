import { Button } from "@foglamp/ui/components/button";
import { IconPencilFilled } from "@tabler/icons-react";

import { RouteHeader } from "@/components/app/route-header";

// The real title is the eval's name (fetched data), so the fallback shows the
// generic crumb until the page streams in. The Edit button renders disabled so
// the header chrome doesn't shift when the page mounts.
export default function Loading() {
	return (
		<RouteHeader
			href="/evals"
			back
			title="Eval"
			withRange
			actions={
				<Button variant="secondary" disabled>
					<IconPencilFilled />
					Edit
				</Button>
			}
		/>
	);
}
