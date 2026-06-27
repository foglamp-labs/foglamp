// Resolve a favicon through the SAME-ORIGIN proxy (app/api/favicon/route.ts).
// Never hit the external favicon service directly from the browser — a
// cross-origin <img> taints the html-to-image export canvas and the logos
// vanish from the downloaded PNG.

export function faviconUrl(domain: string): string {
  return `/api/favicon?domain=${encodeURIComponent(domain)}`;
}
