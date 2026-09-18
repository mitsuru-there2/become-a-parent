import { syncGrandparents } from "./grandparents";
import type { State } from "./types";
import { PEOPLE, clone } from "./shared";

export const tenPoint = (state: Pick<State, "versions">) =>
  ["rules-4", "rules-5", "rules-6", "rules-7", "rules-8"].includes(state.versions.rules);
export const parentFields = ["stress", "health", "fulfillment", "social", "regret"] as const;
export const pointEffect = (value: number) => Math.sign(value) * Math.ceil(Math.abs(value) / 5);
export const pointDrift = (value: number) => Math.sign(value) * Math.ceil(Math.abs(value) / 10);
export const clampParent = (state: State, value: number) =>
  Math.max(0, Math.min(tenPoint(state) ? 10 : 100, Math.round(value)));
export const parentEquivalent = (state: State, value: number) => value * (tenPoint(state) ? 10 : 1);

// 旧イベント条件・成人後の評価は100点単位の契約を維持する。
export function scaleParents(state: State, factor: number) {
  for (const p of PEOPLE)
    for (const key of parentFields)
      state.parents[p][key] = Math.round(state.parents[p][key] * factor);
  if (state.grandparents.members)
    for (const person of Object.values(state.grandparents.members)) {
      person.health = Math.round(person.health * factor);
      person.relation = Math.round(person.relation * factor);
    }
  state.couple = Math.round(state.couple * factor);
  state.grandparents.health = Math.round(state.grandparents.health * factor);
  state.grandparents.relation = Math.round(state.grandparents.relation * factor);
  syncGrandparents(state.grandparents);
}
export function legacyEquivalent(state: State) {
  if (!tenPoint(state)) return state;
  const copy = { ...state, parents: clone(state.parents), grandparents: clone(state.grandparents) };
  scaleParents(copy, 10);
  return copy;
}
