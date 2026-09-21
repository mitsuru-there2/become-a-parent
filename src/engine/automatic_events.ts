import { meetsLifeRequirement } from "./life_requirements";
import { applyGrandparentDelta, syncGrandparents } from "./grandparents";
import type { AutomaticEventResult, State, History } from "./types";
import type { AutomaticEvent } from "../content/automatic_event_schema";
import { contentFor } from "../content/catalog";
import { clone } from "./shared";
import { matches } from "./events";
import { draw, observeChild } from "./simulation";
import { activeTreeEffects, modifiedDelta, treeEnabled } from "./tree_effects";

export const automaticEventsEnabled = (state: State) =>
  ["rules-6", "rules-7", "rules-8", "rules-9", "rules-10", "rules-11"].includes(
    state.versions.rules,
  );
export function applyAutomaticEvents(state: State): History | null {
  const turn = state.n + 1;
  const age = state.n * 6;
  const content = contentFor(state);
  // 効果によって同じ期の他イベントの当選条件を変えない。
  const selected = [...(content.automatic_events ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((event) => {
      const seen = state.seen[`automatic:${event.id}`];
      if (
        age < event.min_age_months ||
        age > event.max_age_months ||
        (seen !== undefined && (event.once || turn - seen < event.cooldown)) ||
        !event.conditions.every((c) => matches(state, c)) ||
        !meetsLifeRequirement(state, event.requires)
      )
        return [];
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
      return draw(state, "automatic-event", turn, event.id) < probability
        ? [{ event, probability }]
        : [];
    })
    .sort(
      (a, b) =>
        b.probability - a.probability ||
        (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
    )
    .slice(0, state.settings?.max_automatic_events ?? Number.MAX_SAFE_INTEGER)
    .map(({ event }) => event)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!selected.length) return null;
  const text: string[] = [];
  const money: History["money"] = [];
  const eventResults: AutomaticEventResult[] = [];
  const active = activeTreeEffects(state);
  for (const event of selected) {
    state.seen[`automatic:${event.id}`] = turn;
    text.push(`${event.kind === "good" ? "うれしい出来事" : "困った出来事"}：${event.text}`);
    const changes: string[] = [];
    const modifiers = active.filter((effect) => effect.kind === event.kind);
    const percent = Math.max(
      -80,
      Math.min(
        200,
        modifiers.reduce((sum, effect) => sum + effect.percent, 0),
      ),
    );
    if (modifiers.length) {
      const line = `取得効果：${modifiers.map((m) => `${m.source}「${m.label}」${m.percent > 0 ? "+" : ""}${m.percent}%`).join("、")}（合計${percent > 0 ? "+" : ""}${percent}%）`;
      changes.push(line);
      text.push(line);
    }
    const transfer = event.effects.some((effect) => effect.path.endsWith(".funds"));
    const before = state.cash;
    let income = 0;
    let expense = 0;
    let overflow = 0;
    for (const original of event.effects) {
      const effect = {
        ...original,
        delta:
          transfer && (original.path === "cash" || original.path.endsWith(".funds"))
            ? original.delta
            : modifiedDelta(original.delta, percent),
      };
      const { previous, current } = applyStat(state, effect);
      if (effect.path === "cash") {
        if (effect.delta > 0) {
          income += effect.delta;
          overflow += effect.delta - (current - previous);
        } else expense += previous - current;
      } else if (!effect.path.startsWith("child.")) {
        const label = statLabel(effect.path, treeEnabled(state));
        if (current !== previous) {
          const change = formatChange(label, previous, current, effect.path.endsWith(".funds"));
          text.push(change);
          changes.push(change);
        }
      } else if (current !== previous) {
        // 子どもの現在値は観察文で伝え、イベントでは今回の増減だけを公開する。
        changes.push(formatDelta(statLabel(effect.path), current - previous));
      }
    }
    if (income || expense) {
      const change = formatChange("資金", before, state.cash, true);
      text.push(change);
      changes.push(change);
    }
    eventResults.push({
      event_id: event.id,
      kind: event.kind,
      text: event.text,
      changes,
      ...(event.visual ? { visual: clone(content.visuals[event.visual]) } : {}),
    });
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
    event_results: eventResults,
    money,
    observations: clone(state.observations),
    text,
    related: [],
    adult_result: null,
  };
  state.history.push(entry);
  return clone(entry);
}
function formatDelta(label: string, delta: number, money = false) {
  return `${label} ${delta > 0 ? "+" : ""}${delta}${money ? "万円" : ""}`;
}
function formatChange(label: string, previous: number, current: number, money = false) {
  const unit = money ? "万円" : "";
  return `${label} ${previous}${unit}→${current}${unit}（${current > previous ? "+" : ""}${current - previous}${unit}）`;
}
export function applyStat(state: State, effect: AutomaticEvent["effects"][number]) {
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
export function statLabel(path: string, familyHome = false) {
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
    funds: "資金",
    child: "子ども",
    trust: "信頼",
    autonomy: "主体性",
    interest: "興味",
    ability: "能力",
    study: "学び",
    craft: "創作",
  };
  if (/^grandparents\.(health|relation|funds)$/.test(path))
    return `${familyHome ? "実家" : "祖父母"}・${labels[path.split(".")[1]]}`;
  return path
    .split(".")
    .map((part) => labels[part] ?? part)
    .filter(Boolean)
    .join("・");
}
