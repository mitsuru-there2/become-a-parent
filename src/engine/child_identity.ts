import type { Child, State } from "./types";
import type { LifeDecision, LifeOption } from "../content/life_schema";
import { hiddenTraits } from "../content/child_traits";

export type HiddenTrait = keyof NonNullable<Child["profile"]>;

const titles: { id: string; label: string; trait: HiddenTrait; threshold: number }[] = [
  { id: "pianist", label: "天才ピアニスト", trait: "music", threshold: 45 },
  { id: "athlete", label: "未来のアスリート", trait: "sports", threshold: 45 },
  { id: "inventor", label: "小さな発明家", trait: "making", threshold: 45 },
  { id: "gamer", label: "生粋のゲーマー", trait: "games", threshold: 45 },
  { id: "scholar", label: "知りたがり博士", trait: "research", threshold: 45 },
  { id: "author", label: "物語の紡ぎ手", trait: "writing", threshold: 45 },
  { id: "solo", label: "ひとり時間の達人", trait: "introversion", threshold: 45 },
  { id: "connector", label: "みんなの人気者", trait: "sociability", threshold: 45 },
  { id: "captain", label: "頼れるキャプテン", trait: "leadership", threshold: 45 },
  { id: "keeper", label: "約束を守る人", trait: "responsibility", threshold: 45 },
  { id: "escape", label: "逃げ道の達人", trait: "avoidance", threshold: 45 },
  { id: "stayer", label: "ねばり強い挑戦者", trait: "perseverance", threshold: 45 },
  { id: "virtuoso", label: "音楽の申し子", trait: "music", threshold: 80 },
  { id: "champion", label: "フィールドの王者", trait: "sports", threshold: 80 },
  { id: "master-maker", label: "世紀の発明家", trait: "making", threshold: 80 },
  { id: "game-master", label: "伝説のプレイヤー", trait: "games", threshold: 80 },
];

export function validChildIdentity(child: Child) {
  if (!child.profile || !Array.isArray(child.titles) || !Array.isArray(child.latest_titles))
    return false;
  const profile = child.profile as Record<string, unknown>;
  const ids = new Set(titles.map((title) => title.id));
  return (
    hiddenTraits.every(
      (trait) =>
        Number.isInteger(profile[trait]) &&
        Number(profile[trait]) >= 0 &&
        Number(profile[trait]) <= 100,
    ) &&
    child.titles.every((id) => ids.has(id)) &&
    new Set(child.titles).size === child.titles.length &&
    child.latest_titles.every((id) => child.titles!.includes(id))
  );
}

const features: { id: string; label: string; trait: HiddenTrait }[] = [
  { id: "musician", label: "音楽家", trait: "music" },
  { id: "athlete", label: "スポーツ選手", trait: "sports" },
  { id: "inventor", label: "発明家", trait: "making" },
  { id: "gamer", label: "ゲーマー", trait: "games" },
  { id: "scholar", label: "ガリ勉", trait: "research" },
  { id: "writer", label: "作家", trait: "writing" },
  { id: "homebody", label: "引きこもり", trait: "introversion" },
  { id: "socialite", label: "交流上手", trait: "sociability" },
  { id: "leader", label: "リーダー", trait: "leadership" },
  { id: "reliable", label: "しっかり者", trait: "responsibility" },
  { id: "escapist", label: "逃げ上手", trait: "avoidance" },
  { id: "challenger", label: "挑戦者", trait: "perseverance" },
];

export function initializeChildIdentity(state: State) {
  state.child.profile = Object.fromEntries(hiddenTraits.map((trait) => [trait, 0])) as NonNullable<
    Child["profile"]
  >;
  state.child.titles = [];
  state.child.latest_titles = [];
}

// Each route gives its own long-term flavor. The option text adds small, contextual shifts.
const routeGrowth: Record<string, [HiddenTrait, HiddenTrait]> = {
  "school:public": ["research", "sociability"],
  "school:private": ["research", "perseverance"],
  "school:international": ["sociability", "leadership"],
  "school:home": ["research", "introversion"],
  "home:daily": ["responsibility", "perseverance"],
  "home:memory": ["writing", "sociability"],
  "home:adventure": ["sports", "perseverance"],
  "home:independence": ["leadership", "responsibility"],
  "grandparents:visit": ["sociability", "responsibility"],
  "grandparents:care": ["responsibility", "perseverance"],
  "grandparents:legacy": ["writing", "music"],
  "afterschool:maker": ["making", "games"],
  "afterschool:music": ["music", "writing"],
  "afterschool:sports": ["sports", "leadership"],
  "work:balance": ["responsibility", "sociability"],
  "work:career": ["leadership", "perseverance"],
  "work:venture": ["making", "leadership"],
};
const textGrowth: [RegExp, HiddenTrait][] = [
  [/音楽|歌|演奏|楽器|子守歌/, "music"],
  [/運動|スポーツ|試合|走|大会/, "sports"],
  [/工作|作る|制作|発明|ロボット/, "making"],
  [/ゲーム|遊ぶ|遊び|勝負/, "games"],
  [/研究|実験|図書|教材|勉強/, "research"],
  [/物語|絵本|日記|手紙|作文/, "writing"],
  [/宿題.*休|研究.*締切をなく/, "avoidance"],
];

export function applyHiddenJudgment(state: State, node: LifeDecision, option: LifeOption) {
  const profile = state.child.profile;
  if (!profile) return;
  const route = option.routes?.[0] ?? node.route;
  const growth = routeGrowth[`${node.route_group}:${route}`];
  const deltas: Partial<Record<HiddenTrait, number>> = {};
  if (growth) {
    deltas[growth[0]] = 6;
    deltas[growth[1]] = (deltas[growth[1]] ?? 0) + 4;
  }
  for (const [pattern, trait] of textGrowth)
    if (pattern.test(node.title)) deltas[trait] = (deltas[trait] ?? 0) + 3;
  for (const effect of option.hidden_effects ?? []) {
    const trait = effect.path.slice("child.profile.".length) as HiddenTrait;
    deltas[trait] = (deltas[trait] ?? 0) + effect.delta;
  }
  for (const [trait, delta] of Object.entries(deltas) as [HiddenTrait, number][])
    profile[trait] = Math.max(0, Math.min(100, profile[trait] + delta));
  awardChildTitles(state);
}

export function awardChildTitles(state: State) {
  const profile = state.child.profile;
  if (!profile) return;
  const owned = state.child.titles ?? (state.child.titles = []);
  for (const title of titles) {
    if (profile[title.trait] >= title.threshold && !owned.includes(title.id)) {
      owned.push(title.id);
      (state.child.latest_titles ??= []).push(title.id);
    }
  }
}

export function publicChildIdentity(child: Child) {
  if (!child.profile) return undefined;
  const strongest = features.reduce<(typeof features)[number] | null>(
    (best, feature) =>
      !best || child.profile![feature.trait] > child.profile![best.trait] ? feature : best,
    null,
  );
  const feature =
    strongest && child.profile[strongest.trait] >= 12
      ? { id: strongest.id, label: strongest.label }
      : { id: "discovering", label: "成長中" };
  const earned = titles.filter((title) => child.titles?.includes(title.id));
  return {
    titles: earned.map(({ id, label }) => ({ id, label })),
    latest_titles: earned
      .filter((title) => child.latest_titles?.includes(title.id))
      .map(({ id, label }) => ({ id, label })),
    feature,
  };
}
