import { PlayerProfileContent } from "@/components/profile/player-profile-content";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/player/$playerId")({
  component: PlayerProfilePage,
});

function PlayerProfilePage() {
  const { playerId } = Route.useParams();
  return <PlayerProfileContent playerId={playerId} />;
}
