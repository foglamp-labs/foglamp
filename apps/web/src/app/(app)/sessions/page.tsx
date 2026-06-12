import { Suspense } from "react";

import { SessionsClient } from "./sessions-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsClient />
    </Suspense>
  );
}
