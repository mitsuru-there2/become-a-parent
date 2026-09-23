import { contentFor } from "../content/catalog";
import type { State } from "./types";

export const stageModel = (s: State) =>
  s.versions.rules === "rules-13" || s.versions.rules === "rules-14";
export const stageIndex = (s: State) =>
  Math.min(4, Math.floor((s.phase === "childhood" ? s.n : Math.max(0, s.n - 1)) / 8));
export const stageRouteId = (group: string) => `crossroad-${group}`;
export const routeAtStage = (s: State, group: string, stage = stageIndex(s)) =>
  s.life?.stage_routes?.[`${stage}:${group}`];
export function inheritStageRoutes(s: State) {
  const index = stageIndex(s);
  if (!index || s.phase !== "childhood") return;
  for (const group of contentFor(s).life_game!.route_groups!) {
    const previous = routeAtStage(s, group.id, index - 1);
    if (previous) s.life!.stage_routes![`${index}:${group.id}`] ??= previous;
  }
}
export const canChangeStageRoute = (s: State, group: string) =>
  s.phase === "childhood" &&
  s.n % 8 === 0 &&
  (stageIndex(s) > 0 || s.versions.rules === "rules-14") &&
  !!routeAtStage(s, group) &&
  (stageIndex(s) === 0
    ? !s.history.some((entry) =>
        entry.events.some((event) => event.event_id === stageRouteId(group)),
      )
    : routeAtStage(s, group) === routeAtStage(s, group, stageIndex(s) - 1));

export function activeStageEffects(s: State) {
  if (!s.life || s.phase !== "childhood") return [];
  return contentFor(s).life_game!.decisions.flatMap((node) =>
    node.options.flatMap((option) => {
      const acquired = s.life!.history[`${node.id}:${option.id}`];
      if (!acquired) return [];
      const sameStage = Math.floor((acquired.first_turn - 1) / 8) === stageIndex(s);
      return [
        ...(sameStage && option.stage_effect
          ? [{ duration: "stage" as const, effect: option.stage_effect }]
          : []),
        ...(option.permanent_effect
          ? [{ duration: "permanent" as const, effect: option.permanent_effect }]
          : []),
      ].map((item) => ({ ...item, node, option, source: `${node.title} / ${option.label}` }));
    }),
  );
}
