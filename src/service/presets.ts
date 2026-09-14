import type { PublicState, Work, Plan } from "../engine/types";
import { PEOPLE, clone } from "../engine/shared";
export const PRESETS = {
  "1": "好きに付き合う",
  "2": "目標を目指す",
  "3": "余白を作る",
  "4": "親の時間も",
};
export function preset(pub: PublicState, name: keyof typeof PRESETS): Plan {
  const plan = clone(pub.plan!),
    care = pub.forecast!.fallback_plan.parents;
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
  for (const [i, p] of PEOPLE.entries()) {
    const [work, bond, rest, self] = layouts[name][i];
    plan.parents[p] = { work, care: care[p].care, bond, rest, self };
  }
  const active = (name === "1" || name === "2") && pub.time.stage !== "baby";
  plan.activity = {
    domain: active ? "craft" : "none",
    level: active ? (name === "2" ? 2 : 1) : 0,
    sponsor: name === "2" ? "B" : "A",
  };
  plan.style = name === "2" && active ? "coach" : "respect";
  plan.help = "none";
  return plan;
}
