import { WorkflowDetailClient } from "./workflow-detail-client";

export default async function WorkflowDetailPage({
	params,
}: {
	params: Promise<{ name: string }>;
}) {
	const { name } = await params;
	return <WorkflowDetailClient nameParam={decodeURIComponent(name)} />;
}
