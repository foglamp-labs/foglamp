import { Suspense } from "react";

import { WorkflowsHeader } from "./header";
import { WorkflowsClient } from "./workflows-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
// The fallback repeats loading.tsx's header so the handoff doesn't flash.
export default function WorkflowsPage() {
  return (
    <Suspense fallback={<WorkflowsHeader />}>
      <WorkflowsClient />
    </Suspense>
  );
}
