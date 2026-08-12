import type { MetadataRoute } from "next";

import { products } from "@/components/marketing/products";
import { SITE_URL } from "@/lib/links";

// Indexable marketing routes only. The dashboard + auth flows are excluded (see
// robots.ts), and so is the `/homepage` alias — it's a deliberate duplicate of
// `/` for signed-in users and canonicalises to `/`, so it has no place here.
export default function sitemap(): MetadataRoute.Sitemap {
	const entries: { path: string; priority: number }[] = [
		{ path: "", priority: 1 },
		{ path: "/pricing", priority: 0.9 },
		...products.map((p) => ({ path: p.href as string, priority: 0.8 })),
		{ path: "/privacy", priority: 0.3 },
		{ path: "/terms", priority: 0.3 },
	];

	return entries.map(({ path, priority }) => ({
		url: `${SITE_URL}${path}`,
		changeFrequency: "weekly",
		priority,
	}));
}
