import { type PosterData, validatePoster } from "@foglamp/contracts/poster";
import { env } from "@foglamp/env/web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PosterBoard } from "@/components/poster/poster-board";

// SSR uses the internal server URL when set (private network), else the public one.
const SERVER = env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL;

async function loadPoster(slug: string): Promise<PosterData | null> {
  try {
    const res = await fetch(`${SERVER}/poster/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const parsed = validatePoster(await res.json());
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPoster(slug);
  if (!data) return { title: "Poster not found · Foglamp" };
  return {
    title: `${data.project.name} · Foglamp`,
    description: data.project.tagline ?? `How ${data.project.name} uses AI, mapped by Foglamp.`,
    // Unlisted: viewable by link, but not indexed.
    robots: { index: false, follow: false },
  };
}

export default async function PosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadPoster(slug);
  if (!data) notFound();
  return <PosterBoard data={data} />;
}
