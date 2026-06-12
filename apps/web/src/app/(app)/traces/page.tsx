import { Suspense } from "react";

import { TracesHeader } from "./header";
import { TracesClient } from "./traces-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
// The fallback repeats loading.tsx's header so the handoff doesn't flash.
export default function TracesPage() {
  return (
    <Suspense fallback={<TracesHeader />}>
      <TracesClient />
    </Suspense>
  );
}
