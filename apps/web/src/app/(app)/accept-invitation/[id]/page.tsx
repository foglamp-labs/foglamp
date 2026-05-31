import { AcceptInvitationClient } from "./accept-invitation-client";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AcceptInvitationClient invitationId={id} />;
}
