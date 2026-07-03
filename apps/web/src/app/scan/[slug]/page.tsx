import { type ScanData, validateScan } from "@foglamp/contracts/scan";
import { env } from "@foglamp/env/web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScanBoard } from "@/components/scan/scan-board";

// SSR uses the internal server URL when set (private network), else the public one.
const SERVER = env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL;

async function loadScan(slug: string): Promise<ScanData | null> {
  try {
    const res = await fetch(`${SERVER}/scan/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const parsed = validateScan(await res.json());
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
  const data = await loadScan(slug);
  if (!data) return { title: { absolute: "Scan not found • Foglamp Scan" } };
  return {
    title: { absolute: `${data.project.name} • Foglamp Scan` },
    description: `A living map of how ${data.project.name} uses AI. Scanned by Foglamp.`,
    // Unlisted: viewable by link, but not indexed.
    robots: { index: false, follow: false },
  };
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadScan(slug);
  if (!data) notFound();
  return <ScanBoard data={data} />;
}
