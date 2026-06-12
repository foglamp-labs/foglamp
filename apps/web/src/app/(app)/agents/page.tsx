import { Suspense } from "react";

import { AgentsClient } from "./agents-client";
import { AgentsHeader } from "./header";

// Suspense because the client reads useSearchParams (URL-backed filters).
// The fallback repeats loading.tsx's header so the handoff doesn't flash.
export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsHeader />}>
      <AgentsClient />
    </Suspense>
  );
}
