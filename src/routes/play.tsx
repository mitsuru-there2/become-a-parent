import { createFileRoute } from "@tanstack/react-router";
import { GameLayout, Play } from "../components/game/screens";

export const Route = createFileRoute("/play/$runId")({
  ssr: false,
  component: PlayPage,
});

function PlayPage() {
  const { runId } = Route.useParams();
  return (
    <GameLayout>
      <Play runId={runId} />
    </GameLayout>
  );
}
