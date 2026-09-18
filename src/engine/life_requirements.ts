import type { State } from "./types";
import type { LifeRequirement } from "../content/life_requirements_schema";
import { matches } from "./events";
export function meetsLifeRequirement(state: State, requirement?: LifeRequirement): boolean {
  if (!requirement) return true;
  return (
    (requirement.history ?? []).every((r) => {
      const history = state.life?.history[`${r.decision}:${r.option}`];
      return history !== undefined && state.n - history.first_turn >= r.after;
    }) &&
    (requirement.policies ?? []).every((r) => state.life?.policies[r.decision] === r.option) &&
    (requirement.stats ?? []).every((r) => matches(state, r))
  );
}
