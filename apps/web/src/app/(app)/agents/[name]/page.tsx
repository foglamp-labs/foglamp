import { AgentDetailClient } from "./agent-detail-client";

export default async function AgentDetailPage({
	params,
}: {
	params: Promise<{ name: string }>;
}) {
	const { name } = await params;
	return <AgentDetailClient agentName={decodeURIComponent(name)} />;
}
