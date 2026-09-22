import { difficultyFor } from "../content/catalog";
import type { State } from "./types";

export const baseIncome = (state: State) => {
  if (state.versions.rules !== "rules-14")
    return (
      state.settings?.content.life_game?.income ??
      state.settings?.content.decision_game?.income ??
      0
    );
  const difficulty = difficultyFor(state);
  const income = difficulty.base_income ?? state.settings?.content.life_game?.income ?? 0;
  return income + (difficulty.income_growth_per_stage ?? 0) * Math.floor(state.n / 8);
};

export const eventProbability = (state: State, kind: "good" | "bad", probability: number) => {
  if (state.versions.rules !== "rules-14" || probability === 0 || probability === 100)
    return probability;
  const difficulty = difficultyFor(state);
  const percent =
    kind === "good" ? difficulty.good_event_probability : difficulty.bad_event_probability;
  return Math.max(0, Math.min(100, Math.round((probability * (percent ?? 100)) / 100)));
};

const harmfulWhenPositive =
  /^(parents\.[AB]\.(stress|regret)|decisions\.fatigue\.[AB]|child\.stress)$/;

export const difficultyDelta = (state: State, path: string, delta: number) => {
  if (state.versions.rules !== "rules-14") return delta;
  if (delta === 0) return 0;
  const beneficial = harmfulWhenPositive.test(path) ? delta < 0 : delta > 0;
  const difficulty = difficultyFor(state);
  const percent = beneficial ? difficulty.positive_effect : difficulty.negative_effect;
  return Math.sign(delta) * Math.round((Math.abs(delta) * (percent ?? 100)) / 100);
};

export const difficultyIncome = (state: State, amount: number) => {
  if (state.versions.rules !== "rules-14" || amount <= 0) return amount;
  return Math.round((amount * (difficultyFor(state).income_effect ?? 100)) / 100);
};
