import type { PublicState, Work, Plan } from "../engine/types";
import { PEOPLE, clone } from "../engine/shared";
export const PRESETS = {
  "1": "好きに付き合う",
  "2": "目標を目指す",
  "3": "余白を作る",
  "4": "親の時間も",
};
export function preset(publicState: PublicState, name: keyof typeof PRESETS): Plan {
  const plan = clone(publicState.plan!);
  const care = publicState.forecast!.fallback_plan.parents;
  const layouts: Record<keyof typeof PRESETS, [Work, number, number, number][]> = {
    "1": [
      ["normal", 1, 2, 1],
      ["normal", 1, 2, 1],
    ],
    "2": [
      ["heavy", 0, 1, 0],
      ["normal", 1, 1, 0],
    ],
    "3": [
      ["normal", 1, 3, 1],
      ["normal", 1, 3, 1],
    ],
    "4": [
      ["heavy", 0, 1, 2],
      ["normal", 0, 1, 2],
    ],
  };
  for (const [index, parentId] of PEOPLE.entries()) {
    const [work, bond, rest, self] = layouts[name][index];
    plan.parents[parentId] = { work, care: care[parentId].care, bond, rest, self };
  }
  const hasActivity = (name === "1" || name === "2") && publicState.time.stage !== "baby";
  plan.activity = {
    domain: hasActivity ? "craft" : "none",
    level: hasActivity ? (name === "2" ? 2 : 1) : 0,
    sponsor: name === "2" ? "B" : "A",
  };
  plan.style = name === "2" && hasActivity ? "coach" : "respect";
  plan.help = "none";
  return plan;
}
