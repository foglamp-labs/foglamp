import { Suspense } from "react";

import { TracesClient } from "./traces-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
export default function TracesPage() {
  return (
    <Suspense>
      <TracesClient />
    </Suspense>
  );
}
