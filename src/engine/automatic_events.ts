import { applyGrandparentDelta, syncGrandparents } from "./grandparents";
import type { State, History } from "./types";
import type { AutomaticEvent } from "../content/automatic_event_schema";
import { contentFor } from "../content/catalog";
import { clone } from "./shared";
import { matches } from "./events";
import { draw, observeChild } from "./simulation";

export const automaticEventsEnabled = (state: State) =>
  ["rules-6", "rules-7"].includes(state.versions.rules);
export function applyAutomaticEvents(state: State): History | null {
  const turn = state.n + 1;
  const age = state.n * 6;
  // 効果によって同じ期の他イベントの当選条件を変えない。
  const selected = [...(contentFor(state).automatic_events ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((event) => {
      const seen = state.seen[`automatic:${event.id}`];
      if (
        age < event.min_age_months ||
        age > event.max_age_months ||
        (seen !== undefined && (event.once || turn - seen < event.cooldown)) ||
        !event.conditions.every((c) => matches(state, c))
      )
        return false;
      const probability = Math.max(
        0,
        Math.min(
          100,
          event.probability +
            event.modifiers.reduce(
              (sum, modifier) => sum + (matches(state, modifier.condition) ? modifier.add : 0),
              0,
            ),
        ),
      );
      return draw(state, "automatic-event", turn, event.id) < probability;
    });
  if (!selected.length) return null;
  const text: string[] = [];
  const money: History["money"] = [];
  for (const event of selected) {
    state.seen[`automatic:${event.id}`] = turn;
    text.push(`${event.kind === "good" ? "うれしい出来事" : "困った出来事"}：${event.text}`);
    const before = state.cash;
    let income = 0;
    let expense = 0;
    let overflow = 0;
    for (const effect of event.effects) {
      const { previous, current } = applyStat(state, effect);
      if (effect.path === "cash") {
        if (effect.delta > 0) {
          income += effect.delta;
          overflow += effect.delta - (current - previous);
        } else expense += previous - current;
      } else if (!effect.path.startsWith("child.")) {
        const label = statLabel(effect.path);
        if (current !== previous)
          text.push(
            `${label} ${previous}→${current}（${current > previous ? "+" : ""}${current - previous}）`,
          );
      }
    }
    if (income || expense)
      text.push(
        `資金 ${before}→${state.cash}万円（${state.cash >= before ? "+" : ""}${state.cash - before}万円）`,
      );
    money.push({
      scope: "household",
      before,
      after: state.cash,
      income,
      expense,
      cap_overflow: overflow,
    });
  }
  state.observations = observeChild(state);
  const entry: History = {
    index: state.history.length,
    kind: "special",
    turn,
    adult_step: null,
    ages: {
      child_months: age,
      A_months: state.parents.A.age_months,
      B_months: state.parents.B.age_months,
    },
    actions: null,
    events: selected.map((e) => ({
      instance_id: `t${String(turn).padStart(2, "0")}:automatic:${e.id}`,
      event_id: e.id,
      option_id: null,
      text: e.text,
    })),
    money,
    observations: clone(state.observations),
    text,
    related: [],
    adult_result: null,
  };
  state.history.push(entry);
  return clone(entry);
}
function applyStat(state: State, effect: AutomaticEvent["effects"][number]) {
  if (state.grandparents.members && /^grandparents\.(health|relation|funds)$/.test(effect.path)) {
    const field = effect.path.split(".")[1] as "health" | "relation" | "funds";
    const previous = state.grandparents[field];
    applyGrandparentDelta(state.grandparents, field, effect.delta, 10);
    return { previous, current: state.grandparents[field] };
  }
  const keys = effect.path.split(".");
  let object = state as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) object = object[key] as Record<string, unknown>;
  const key = keys.at(-1)!;
  const previous = object[key] as number;
  const max =
    effect.path === "cash" || effect.path.endsWith(".funds")
      ? 99999
      : effect.path.startsWith("child.")
        ? 100
        : 10;
  const current = Math.max(0, Math.min(max, previous + effect.delta));
  object[key] = current;
  syncGrandparents(state.grandparents);
  return { previous, current };
}
function statLabel(path: string) {
  const labels: Record<string, string> = {
    parents: "",
    decisions: "",
    A: "父",
    B: "母",
    grandparents: "",
    members: "",
    grandfather: "祖父",
    grandmother: "祖母",
    stress: "ストレス",
    health: "体力",
    fulfillment: "充実",
    social: "社会関係",
    regret: "後悔",
    couple: "夫婦の関係",
    fatigue: "疲労",
    skills: "能力",
    dialogue: "対話",
    planning: "段取り",
    learning: "学びの支援",
    relation: "関係",
    funds: "資金（万円）",
  };
  if (/^grandparents\.(health|relation|funds)$/.test(path))
    return `祖父母・${labels[path.split(".")[1]]}`;
  return path
    .split(".")
    .map((part) => labels[part] ?? part)
    .filter(Boolean)
    .join("・");
}
