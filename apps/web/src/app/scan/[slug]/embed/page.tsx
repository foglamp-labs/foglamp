import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmbedBoard } from "@/components/scan/embed-board";
import { loadScan } from "@/lib/scan-load";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadScan(slug);
  return {
    title: {
      absolute: data
        ? `${data.project.name} • Foglamp Scan`
        : "Scan not found • Foglamp Scan",
    },
    robots: { index: false, follow: false },
  };
}

// Iframe-embeddable version of a scan — the map only, for blogs/docs:
//   <iframe src="https://foglamp.dev/scan/<slug>/embed" …>
export default async function ScanEmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadScan(slug);
  if (!data) notFound();
  return <EmbedBoard data={data} slug={slug} />;
}
