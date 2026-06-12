import { Suspense } from "react";

import { SessionsHeader } from "./header";
import { SessionsClient } from "./sessions-client";

// Suspense because the client reads useSearchParams (URL-backed filters).
// The fallback repeats loading.tsx's header so the handoff doesn't flash.
export default function SessionsPage() {
  return (
    <Suspense fallback={<SessionsHeader />}>
      <SessionsClient />
    </Suspense>
  );
}
