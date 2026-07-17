import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScanBoard } from "@/components/scan/scan-board";
import { loadPreviousScan, loadScan } from "@/lib/scan-load";

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
  const [data, previous] = await Promise.all([
    loadScan(slug),
    loadPreviousScan(slug),
  ]);
  if (!data) notFound();
  return <ScanBoard data={data} previous={previous} />;
}
