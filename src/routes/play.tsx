import { createFileRoute } from "@tanstack/react-router";
import { GameLayout, Play } from "../components/game/screens";

export const Route = createFileRoute("/play/$runId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { category?: string } =>
    typeof search.category === "string" ? { category: search.category } : {},
  component: PlayPage,
});

function PlayPage() {
  const { runId } = Route.useParams();
  const { category } = Route.useSearch();
  return (
    <GameLayout>
      <Play runId={runId} category={category} />
    </GameLayout>
  );
}
