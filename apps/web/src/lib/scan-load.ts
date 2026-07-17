import { type ScanData, validateScan } from "@foglamp/contracts/scan";
import { env } from "@foglamp/env/web";

// SSR uses the internal server URL when set (private network), else the public one.
const SERVER = env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL;

async function fetchScan(path: string): Promise<ScanData | null> {
  try {
    const res = await fetch(`${SERVER}${path}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const parsed = validateScan(await res.json());
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

export function loadScan(slug: string): Promise<ScanData | null> {
  return fetchScan(`/scan/${encodeURIComponent(slug)}`);
}

/** The version before the scan's last update; null if never updated. */
export function loadPreviousScan(slug: string): Promise<ScanData | null> {
  return fetchScan(`/scan/${encodeURIComponent(slug)}/previous`);
}
