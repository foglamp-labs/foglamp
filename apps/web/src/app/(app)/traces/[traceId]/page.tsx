import { TraceDetailClient } from "./trace-detail-client";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  return <TraceDetailClient traceId={decodeURIComponent(traceId)} />;
}
