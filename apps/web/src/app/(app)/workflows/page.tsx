import { Suspense } from "react";

import { WorkflowsClient } from "./workflows-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
export default function WorkflowsPage() {
  return (
    <Suspense>
      <WorkflowsClient />
    </Suspense>
  );
}
