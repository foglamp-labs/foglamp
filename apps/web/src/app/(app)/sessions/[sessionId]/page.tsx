import { SessionDetailClient } from "./session-detail-client";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionDetailClient sessionId={decodeURIComponent(sessionId)} />;
}
