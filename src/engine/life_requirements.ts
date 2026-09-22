import { stageModel, activeStageEffects } from "./stage_state";
import type { State } from "./types";
import type { LifeRequirement } from "../content/life_requirements_schema";
import { matches } from "./events";
import { contentFor } from "../content/catalog";
import { baseIncome, difficultyIncome } from "./difficulty";
export function annualIncome(state: State): number {
  const game = contentFor(state).life_game;
  if (!game || !state.life) return 0;
  if (stageModel(state))
    return Math.max(
      0,
      (baseIncome(state) +
        activeStageEffects(state).reduce(
          (sum, { effect }) =>
            sum + difficultyIncome(state, effect.income) - (effect.income_reduction ?? 0),
          0,
        )) *
        2,
    );
  let income = baseIncome(state);
  for (const node of game.decisions) {
    if (
      node.kind !== "policy" ||
      state.n * 6 < node.min_age_months ||
      state.n * 6 > node.max_age_months
    )
      continue;
    const option = node.options.find((o) => o.id === state.life!.policies[node.id]);
    if (option) income += option.income - (option.income_reduction ?? 0);
  }
  return Math.max(0, income * 2);
}
export function meetsLifeRequirement(state: State, requirement?: LifeRequirement): boolean {
  if (!requirement) return true;
  return (
    (requirement.annual_income === undefined || annualIncome(state) >= requirement.annual_income) &&
    (requirement.history ?? []).every((r) => {
      const history = state.life?.history[`${r.decision}:${r.option}`];
      return (
        history !== undefined &&
        state.n + (stageModel(state) ? 1 : 0) - history.first_turn >= r.after
      );
    }) &&
    (requirement.policies ?? []).every((r) =>
      stageModel(state)
        ? activeStageEffects(state).some(
            ({ node, option }) => node.id === r.decision && option.id === r.option,
          )
        : state.life?.policies[r.decision] === r.option,
    ) &&
    (requirement.stats ?? []).every((r) => matches(state, r))
  );
}
