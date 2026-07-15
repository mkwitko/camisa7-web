import { InvitePageContent } from "@/components/invite/invite-page-content";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  return <InvitePageContent token={token} />;
}
