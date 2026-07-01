// Resolve a favicon through the same-origin proxy (app/api/favicon/route.ts),
// which fetches the upstream favicon service server-side and caches it — keeps
// the browser on a single origin and avoids hammering the external service.

export function faviconUrl(domain: string): string {
  return `/api/favicon?domain=${encodeURIComponent(domain)}`;
}
