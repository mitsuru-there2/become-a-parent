import { contentFor } from "../content/catalog";
import type { State } from "./types";

export const treeEnabled = (state: State) =>
  ["rules-9", "rules-10", "rules-11"].includes(state.versions.rules);

export function activeTreeEffects(state: State) {
  if (!treeEnabled(state) || !state.life) return [];
  return contentFor(state).life_game!.decisions.flatMap((node) =>
    node.options.flatMap((option) => {
      const active =
        node.kind === "policy"
          ? state.life!.policies[node.id] === option.id &&
            state.n * 6 >= node.min_age_months &&
            state.n * 6 <= node.max_age_months
          : !!state.life!.history[`${node.id}:${option.id}`];
      return active
        ? (option.event_modifiers ?? []).map((effect) => ({
            ...effect,
            source: `${node.title} / ${option.label}`,
          }))
        : [];
    }),
  );
}

export function modifiedDelta(delta: number, percent: number) {
  const magnitude = Math.abs(delta);
  let result = Math.round(magnitude * (1 + percent / 100));
  if (percent && result === magnitude && magnitude) result += Math.sign(percent);
  return Math.sign(delta) * Math.max(0, result);
}
