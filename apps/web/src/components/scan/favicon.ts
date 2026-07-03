// Resolve a favicon through the same-origin proxy (app/api/favicon/route.ts),
// which fetches the upstream favicon service server-side and caches it — keeps
// the browser on a single origin and avoids hammering the external service.

export function faviconUrl(domain: string): string {
  return `/api/favicon?domain=${encodeURIComponent(domain)}`;
}

/**
 * Product-accurate icon domains for models: agents often emit the provider's
 * corporate domain (google.com → the "G"), but the model deserves its product
 * mark (Gemini's spark). Keyed by label match, applied only to model items.
 */
const MODEL_DOMAIN_FIXES: [RegExp, string][] = [
  [/gemini/i, "gemini.google.com"],
  [/claude/i, "claude.ai"],
  [/gpt|^o[0-9]/i, "openai.com"],
];

export function modelDomain(label: string, domain?: string): string | undefined {
  for (const [re, fixed] of MODEL_DOMAIN_FIXES) {
    if (re.test(label)) return fixed;
  }
  return domain;
}
