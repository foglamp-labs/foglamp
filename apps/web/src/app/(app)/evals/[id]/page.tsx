import { EvalDetailClient } from "./eval-detail-client";

export default async function EvalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EvalDetailClient evalId={decodeURIComponent(id)} />;
}
