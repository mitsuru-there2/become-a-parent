import type { NumericState } from "./types";

export const GRANDPARENTS = ["grandfather", "grandmother"] as const;
export const grandparentNames = { grandfather: "祖父", grandmother: "祖母" };
type Grandparents = NumericState["grandparents"];

// 旧コンテンツ向けの集計値。個人値が正本で、共通の財布は持たない。
export function syncGrandparents(group: Grandparents) {
  if (!group.members) return;
  const { grandfather: a, grandmother: b } = group.members;
  group.health = Math.round((a.health + b.health) / 2);
  group.relation = Math.round((a.relation + b.relation) / 2);
  group.funds = a.funds + b.funds;
  group.network = a.network || b.network;
}

export function applyGrandparentDelta(
  group: Grandparents,
  field: "health" | "relation" | "funds",
  delta: number,
  maxStat: number,
) {
  if (!group.members) return;
  const members = GRANDPARENTS.map((id) => group.members![id]);
  if (field === "funds") {
    const sign = Math.sign(delta);
    let remaining = Math.abs(delta);
    const portions = [Math.ceil(remaining / 2), Math.floor(remaining / 2)];
    for (const [index, person] of members.entries()) {
      const amount = Math.min(portions[index], sign < 0 ? person.funds : 99999 - person.funds);
      person.funds += sign * amount;
      remaining -= amount;
    }
    for (const person of members) {
      const amount = Math.min(remaining, sign < 0 ? person.funds : 99999 - person.funds);
      person.funds += sign * amount;
      remaining -= amount;
    }
  } else {
    for (const person of members)
      person[field] = Math.max(0, Math.min(maxStat, person[field] + delta));
  }
  syncGrandparents(group);
}
