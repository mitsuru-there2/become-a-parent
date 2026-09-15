import { createFileRoute } from "@tanstack/react-router";
import { GameLayout, Home } from "../components/game/screens";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

function HomePage() {
  return (
    <GameLayout>
      <Home />
    </GameLayout>
  );
}
