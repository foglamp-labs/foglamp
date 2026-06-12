import { Suspense } from "react";

import { AgentsClient } from "./agents-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsClient />
    </Suspense>
  );
}
