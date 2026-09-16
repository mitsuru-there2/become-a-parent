import { GRANDPARENTS, grandparentNames, syncGrandparents } from "./grandparents";
import { applyAutomaticEvents, automaticEventsEnabled } from "./automatic_events";
import type { DecisionOption, DecisionTheme } from "../content/decision_schema";
import type { Choice, Forecast, History, Person, State } from "./types";
import type { Settings } from "../content/types";
import { contentFor, difficultyFor } from "../content/catalog";
import { PEOPLE, clampStat, clone } from "./shared";
import { start, draw, stage, observeChild, publicView, applyEffect } from "./simulation";
import { finish } from "./adult";
import { matches } from "./events";

import {
  tenPoint,
  pointEffect,
  pointDrift,
  clampParent,
  parentEquivalent,
  scaleParents,
  legacyEquivalent,
  parentFields,
} from "./stat_scale";

const names = { A: "父", B: "母", both: "父母" };
const skillNames = { dialogue: "対話", planning: "段取り", learning: "学びの支援" };
const dynamicMoney = (state: State) =>
  ["rules-5", "rules-6", "rules-7"].includes(state.versions.rules);
const choiceIncome = (state: State, option: DecisionOption) =>
  dynamicMoney(state) ? (option.income ?? 0) : 0;
const moneyChange = (before: number, after: number) =>
  `資金 ${before}→${after}万円（${after >= before ? "+" : ""}${after - before}万円）`;
const game = (state: State) => contentFor(state).decision_game!;
const instance = (state: State, theme: DecisionTheme) =>
  `t${String(state.n + 1).padStart(2, "0")}:${theme.id}`;

export function startDecisions(
  scenario: string,
  seed: number,
  settings: Settings,
  rules = settings.content.automatic_events
    ? settings.content.decision_game?.initial_grandparents
      ? "rules-7"
      : "rules-6"
    : "rules-5",
): State {
  const state = start(scenario, seed, settings);
  state.versions =
    rules === "rules-3"
      ? { rules, data: "data-3", save: "save-4" }
      : rules === "rules-4"
        ? { rules, data: "data-4", save: "save-5" }
        : rules === "rules-5"
          ? { rules, data: "data-5", save: "save-6" }
          : rules === "rules-6"
            ? { rules, data: "data-6", save: "save-7" }
            : { rules, data: "data-7", save: "save-8" };
  if (tenPoint(state)) scaleParents(state, 0.1);
  if (automaticEventsEnabled(state))
    state.grandparents.funds = game(state).initial_grandparent_funds ?? 40;
  if (rules === "rules-7") {
    state.grandparents.members = clone(game(state).initial_grandparents!);
    syncGrandparents(state.grandparents);
  }
  state.draws = [];
  state.events = [];
  state.seen = {};
  const skills = (p: Person) => ({
    dialogue: 40 + (draw(state, "initial", 0, `${p}-dialogue`) % 31),
    planning: 40 + (draw(state, "initial", 0, `${p}-planning`) % 31),
    learning: 40 + (draw(state, "initial", 0, `${p}-learning`) % 31),
  });
  state.decisions = {
    skills: { A: skills("A"), B: skills("B") },
    fatigue: { A: 25, B: 25 },
    special: clone(game(state).events[0]),
    special_answer: null,
    themes: [],
    selections: {},
    contract: null,
    crisis: { divorce: 0, separation: 0 },
    event_history: null,
  };
  if (tenPoint(state)) {
    for (const p of PEOPLE) {
      for (const key of ["dialogue", "planning", "learning"] as const)
        state.decisions.skills[p][key] = Math.round(state.decisions.skills[p][key] / 10);
      state.decisions.fatigue[p] = 3;
    }
  }
  openDecisionTurn(state);
  return state;
}
export function familyStatus(state: State) {
  const d = state.decisions!;
  const burden =
    parentEquivalent(
      state,
      state.parents.A.stress + state.parents.B.stress + d.fatigue.A + d.fatigue.B,
    ) / 4;
  const score =
    (parentEquivalent(state, state.couple) + state.child.trust.A + state.child.trust.B) / 3 -
    burden * 0.2;
  const level = score >= 70 ? 5 : score >= 50 ? 4 : score >= 30 ? 3 : score >= 15 ? 2 : 1;
  const label = ["一家離散の危機", "不穏な雰囲気", "すれ違い気味", "おだやかな家庭", "家族円満"][
    level - 1
  ];
  const description =
    d.crisis.divorce || d.crisis.separation
      ? "深いすれ違いが続いています。次の半年で関係を立て直す必要があります。"
      : level <= 2
        ? "会話と休息の時間を作り、家族の気持ちを確かめたい。"
        : level === 3
          ? "忙しさの中で、気持ちを伝え合う時間が少し減っています。"
          : "家族の間に、互いの話を聞ける余裕があります。";
  return { level, label, description };
}
function eligible(state: State, t: DecisionTheme) {
  if (state.n + 1 < t.min_turn || state.n + 1 > t.max_turn) return false;
  switch (t.condition) {
    case "tired":
      return PEOPLE.some(
        (p) =>
          parentEquivalent(state, state.decisions!.fatigue[p]) >= 55 ||
          parentEquivalent(state, state.parents[p].stress) >= 55,
      );
    case "strained":
      return parentEquivalent(state, state.couple) < 45 || familyStatus(state).level <= 2;
    case "crisis":
      return familyStatus(state).level === 1;
    default:
      return true;
  }
}
function pick(state: State, pool: DecisionTheme[], slot: string) {
  const candidates = pool.filter((t) => eligible(state, t));
  const priority = candidates.filter((t) => t.condition !== "always");
  const options = priority.length ? priority : candidates;
  if (!options.length) throw new Error(`判断候補がありません: ${slot}`);
  return clone(options[draw(state, "decision", state.n + 1, slot) % options.length]);
}
// 旧追加パックも公開の選択として扱う。任意コードは実行しない。
function packEvents(state: State): DecisionTheme[] {
  const turn = state.n + 1;
  return Object.entries(contentFor(state).events)
    .filter(([id, e]) => {
      const t = e.trigger;
      return (
        !/^E-\d+$/.test(id) &&
        turn >= t.min_turn &&
        turn <= t.max_turn &&
        (!t.turns.length || t.turns.includes(turn)) &&
        (!t.once || !state.seen[id]) &&
        turn - (state.seen[id] ?? -100) >= t.cooldown &&
        t.probability > 0 &&
        (t.probability === 100 || draw(state, "decision", turn, `pack-${id}`) < t.probability) &&
        t.all.every((c) => matches(legacyEquivalent(state), c)) &&
        (!t.any.length || t.any.some((c) => matches(legacyEquivalent(state), c)))
      );
    })
    .map(([id, e]) => ({
      id: `pack-event-${id}`,
      title: e.text,
      slot: -1,
      min_turn: 1,
      max_turn: 40,
      condition: "always",
      options: e.options.map((o) => ({
        id: o.id,
        label: o.label,
        cost: o.cost,
        effects: {},
        parent: null,
        skill: null,
        gain: 0,
        domain: null,
        contract: null,
        end: null,
      })),
    }));
}
function openThemes(state: State) {
  state.decisions!.themes = [0, 1, 2].map((slot) =>
    pick(
      state,
      game(state).themes.filter((t) => t.slot === slot),
      `theme-${slot}`,
    ),
  );
  const theme = state.decisions!.themes[0];
  for (const [id, a] of Object.entries(contentFor(state).actions)) {
    if (state.n + 1 < a.min_turn || state.n + 1 > a.max_turn) continue;
    theme.options.push({
      id: `pack-action-${id}`,
      label: a.label,
      cost: a.cost,
      effects: {},
      parent: a.parent,
      skill: null,
      gain: 0,
      domain: a.target,
      contract: null,
      end: null,
    });
  }
}
export function openDecisionTurn(state: State) {
  const d = state.decisions!;
  if (automaticEventsEnabled(state)) {
    if (state.phase !== "childhood" || d.opened_turn === state.n + 1) return;
    d.opened_turn = state.n + 1;
    d.special_answer = "automatic";
    d.selections = {};
    d.event_history = applyAutomaticEvents(state);
    state.observations = observeChild(state);
    openThemes(state);
    return;
  }
  d.special = pick(state, [...game(state).events, ...packEvents(state)], "special");
  if (d.special.id.startsWith("pack-event-")) state.seen[d.special.id.slice(11)] = state.n + 1;
  d.special_answer = null;
  d.themes = [];
  d.selections = {};
  d.event_history = null;
  state.observations = observeChild(state);
}
function choiceDescription(state: State, option: DecisionOption) {
  const info: string[] = [];
  if (option.parent && option.skill)
    info.push(`${names[option.parent]}の${skillNames[option.skill]}が成果に影響`);
  if (option.contract) info.push(`継続費用 ${option.contract.cost}万円／半年（現在の契約を変更）`);
  const fields = {
    fatigue: "疲労",
    stress: "ストレス",
    trust: "親子の信頼",
    couple: "夫婦の関係",
    child_stress: "子どもの負担",
    autonomy: "主体性",
  };
  for (const [field, label] of Object.entries(fields)) {
    const raw = option.effects[field as keyof typeof option.effects];
    const amount =
      raw && tenPoint(state)
        ? ["fatigue", "stress", "couple"].includes(field)
          ? pointEffect(raw)
          : raw * 2
        : raw;
    if (amount)
      info.push(
        `${label} ${amount > 0 ? "+" : ""}${amount}${["fatigue", "stress", "trust"].includes(field) && option.parent ? `（${names[option.parent]}）` : ""}`,
      );
  }
  if (option.end) info.push("選択するとゲームオーバーになります");
  if (option.id.startsWith("pack-action-"))
    info.push(contentFor(state).actions[option.id.slice(12)].description);
  return (
    info.join(" ／ ") || "新たな働きかけはしません。生活費と継続費用、半年の経過は発生します。"
  );
}
export function decisionChoices(state: State): Choice[] {
  if (state.phase !== "childhood") return [];
  const d = state.decisions!;
  const special = !d.special_answer;
  return (special ? [d.special] : d.themes).map((theme) => ({
    kind: special ? "special" : "decision",
    visual: null,
    instance_id: instance(state, theme),
    event_id: theme.id,
    text: theme.title,
    options: theme.options.map((o) => {
      const reason =
        special && o.cost > state.cash
          ? [
              {
                code: "CASH_LIMIT",
                path: instance(state, theme),
                message: "現在の資金が足りません",
              },
            ]
          : [];
      return {
        option_id: `${theme.id}:${o.id}`,
        label: o.label,
        cost: o.cost,
        income: choiceIncome(state, o),
        description: choiceDescription(state, o),
        available: reason.length === 0,
        reasons: reason,
      };
    }),
  }));
}
export function decisionForecast(state: State): Forecast {
  const d = state.decisions!;
  const reasons: Forecast["reasons"] = [];
  if (!d.special_answer)
    reasons.push({
      code: "ANSWER_REQUIRED",
      path: "special",
      message: "特殊イベントへの対応を選んでください",
    });
  let cost = difficultyFor(state).living_cost + stage(state.n, state).cost;
  let contract = d.contract;
  let income = game(state).income;
  for (const theme of d.themes) {
    const selected = d.selections[instance(state, theme)];
    const option = theme.options.find((o) => `${theme.id}:${o.id}` === selected);
    if (!option)
      reasons.push({
        code: "ANSWER_REQUIRED",
        path: instance(state, theme),
        message: `「${theme.title}」への回答が必要です`,
      });
    else {
      cost += option.cost;
      income += choiceIncome(state, option);
      if (option.contract) contract = option.contract;
    }
  }
  cost += contract?.cost ?? 0;
  if (state.cash + income < cost)
    reasons.push({
      code: "CASH_LIMIT",
      path: "cash",
      message: "半年後の資金が不足します。支出や継続する活動を見直してください",
    });
  return {
    income,
    cost,
    projected_cash: dynamicMoney(state)
      ? Math.min(99999, state.cash + income - cost)
      : state.cash + income - cost,
    can_advance:
      state.phase === "childhood" && !!d.special_answer && d.themes.length === 3 && !reasons.length,
    reasons,
    time_used: { A: 0, B: 0 },
    time_limit: 0,
    care_required: 0,
    care_allocated: 0,
    uncertain_expense_cap: 0,
    fallback_plan: clone(state.plan),
  };
}
export function decisionView(state: State) {
  // 旧表示の列挙済み公開境界を使い、隠し能力・気質は出さない。
  const base = publicView({ ...state, decisions: undefined, events: [], answers: {} });
  const d = state.decisions!;
  base.public.plan = null;
  base.public.extra_actions = [];
  base.public.forecast = state.phase === "childhood" ? decisionForecast(state) : null;
  base.public.answers = Object.entries(d.selections).map(([event_instance, option_id]) => ({
    event_instance,
    option_id,
  }));
  base.public.decision_turn = {
    step: state.phase !== "childhood" ? "ended" : d.special_answer ? "decisions" : "special",
    skills: clone(d.skills),
    fatigue: clone(d.fatigue),
    contract: clone(d.contract),
    answered: Object.keys(d.selections).length,
    event_result: d.event_history?.text ?? [],
    previous_result: clone(state.history.findLast((h) => h.kind === "turn") ?? null),
  };
  base.public.family_status = familyStatus(state);
  if (state.game_over) base.public.game_over = clone(state.game_over);
  return { public: base.public, choices: decisionChoices(state) };
}
function applyOption(
  state: State,
  theme: DecisionTheme,
  option: DecisionOption,
  received = { income: 0 },
): string[] {
  const d = state.decisions!;
  const parents = option.parent === "both" ? PEOPLE : option.parent ? [option.parent] : [];
  const before = tenPoint(state)
    ? clone({
        parents: state.parents,
        couple: state.couple,
        fatigue: d.fatigue,
        grandparents: state.grandparents,
      })
    : null;
  const e = { ...option.effects };
  if (tenPoint(state)) {
    for (const key of ["fatigue", "stress", "couple"] as const)
      if (e[key]) e[key] = pointEffect(e[key]);
    for (const key of ["trust", "child_stress", "autonomy"] as const) if (e[key]) e[key] *= 2;
  }
  const gains = parents.map((p) =>
    Math.max(
      0,
      option.gain +
        (option.skill ? Math.floor(parentEquivalent(state, d.skills[p][option.skill]) / 25) : 0) -
        (parentEquivalent(state, d.fatigue[p]) >= 70 ? 2 : 0),
    ),
  );
  const baseGain = gains.length
    ? Math.floor(gains.reduce((a, b) => a + b, 0) / gains.length)
    : option.gain;
  const gain = tenPoint(state) ? baseGain * 2 : baseGain;
  const recovery = tenPoint(state) ? pointEffect(baseGain) : baseGain;
  for (const p of parents) {
    const fatigue = e.fatigue ?? 0;
    d.fatigue[p] = clampParent(
      state,
      d.fatigue[p] -
        (option.skill === "planning" ? recovery : 0) +
        (fatigue > 0
          ? Math.max(
              tenPoint(state) ? 1 : 0,
              fatigue - Math.floor(d.skills[p].planning / (tenPoint(state) ? 6 : 30)),
            )
          : fatigue),
    );
    state.parents[p].stress = clampParent(state, state.parents[p].stress + (e.stress ?? 0));
    state.child.trust[p] = clampStat(
      state.child.trust[p] + (e.trust ?? 0) + (option.skill === "dialogue" ? gain : 0),
    );
  }
  state.couple = clampParent(state, state.couple + (e.couple ?? 0));
  state.child.stress = clampStat(state.child.stress + (e.child_stress ?? 0));
  state.child.autonomy = clampStat(state.child.autonomy + (e.autonomy ?? 0));
  if (option.domain) {
    state.child.ability[option.domain] = clampStat(
      state.child.ability[option.domain] +
        gain +
        (state.child.interest[option.domain] >= 60 ? 1 : 0),
    );
    state.child.interest[option.domain] = clampStat(
      state.child.interest[option.domain] + (state.child.stress >= 70 ? -3 : 1),
    );
  }
  if (option.contract && option.contract.label !== d.contract?.label && option.contract.cost > 0)
    state.child.stress = clampStat(state.child.stress + state.child.adaptation * 2);
  if (option.contract) {
    d.contract = clone(option.contract);
    state.plan.activity = {
      domain: option.contract.cost > 0 ? (option.domain ?? "none") : "none",
      level: option.contract.cost > 0 && option.domain ? 1 : 0,
      sponsor: option.parent === "B" ? "B" : "A",
    };
  }
  if (theme.id === "repair" && option.id === "talk") {
    state.repaired = true;
    state.last_repair = true;
  }
  if (theme.id.startsWith("pack-event-")) {
    const event = contentFor(state).events[theme.id.slice(11)];
    const selected = event.options.find((o) => o.id === option.id)!;
    const target =
      event.target === "craft"
        ? "craft"
        : event.target === "interest"
          ? state.child.interest.craft > state.child.interest.study
            ? "craft"
            : "study"
          : event.target === "previous_activity" && state.previous_plan.activity.domain !== "none"
            ? state.previous_plan.activity.domain
            : "study";
    applyDecisionEffect(state, selected.effects, target);
    const aid = Math.min(state.grandparents.funds, Number(selected.effects.income ?? 0));
    received.income += aid;
    state.cash = Math.min(99999, state.cash + aid);
    state.grandparents.funds -= aid;
    if (selected.effects.delay)
      state.queue.push({
        id: String(selected.effects.delay),
        due_turn: state.n + 3,
        source: instance(state, theme),
        target,
      });
  }
  if (option.id.startsWith("pack-action-")) {
    state.plan.extra_action = option.id.slice(12);
    const action = contentFor(state).actions[option.id.slice(12)];
    applyDecisionEffect(state, action.effects, action.target);
    d.fatigue[action.parent] = clampParent(
      state,
      d.fatigue[action.parent] + (tenPoint(state) ? pointEffect(action.time) : action.time),
    );
  }
  const lines = [`${theme.title} → ${option.label}`];
  if (option.skill)
    lines.push(
      `${parents.map((p) => `${names[p]}の${skillNames[option.skill!]} ${d.skills[p][option.skill!]}`).join("・")}を生かし、${option.skill === "planning" ? `疲労の回復を${recovery}後押しした` : `${option.domain ? "子どもの力" : "関わりの手応え"}が${gain}伸びた`}。`,
    );
  if (!before && (e.fatigue || e.stress))
    lines.push(
      `負担の変化：${parents.map((p) => `${names[p]}の疲労 ${d.fatigue[p]}・ストレス ${state.parents[p].stress}`).join(" ／ ")}`,
    );
  if (before) {
    const change = (label: string, previous: number, current: number) => {
      if (previous !== current)
        lines.push(
          `${label} ${previous}→${current}（${current > previous ? "+" : ""}${current - previous}）`,
        );
    };
    const labels = {
      stress: "ストレス",
      health: "健康",
      fulfillment: "充実",
      social: "社会関係",
      regret: "後悔",
    };
    for (const p of PEOPLE) {
      change(`${names[p]}の疲労`, before.fatigue[p], d.fatigue[p]);
      for (const key of parentFields)
        change(`${names[p]}の${labels[key]}`, before.parents[p][key], state.parents[p][key]);
    }
    change("夫婦の関係", before.couple, state.couple);
    if (state.grandparents.members && before.grandparents.members) {
      for (const id of GRANDPARENTS) {
        const previous = before.grandparents.members[id];
        const current = state.grandparents.members[id];
        change(`${grandparentNames[id]}の体力`, previous.health, current.health);
        change(`${grandparentNames[id]}との関係`, previous.relation, current.relation);
        change(`${grandparentNames[id]}の援助資金（万円）`, previous.funds, current.funds);
      }
    } else {
      change("祖父母の体力", before.grandparents.health, state.grandparents.health);
      change("祖父母との関係", before.grandparents.relation, state.grandparents.relation);
    }
  }
  return lines;
}
function historyEntry(
  state: State,
  kind: History["kind"],
  text: string[],
  beforeCash: number,
  income: number,
  expense: number,
): History {
  return {
    index: state.history.length,
    kind,
    turn: state.n + (kind === "special" ? 1 : 0),
    adult_step: null,
    ages: {
      child_months: state.n * 6,
      A_months: state.parents.A.age_months,
      B_months: state.parents.B.age_months,
    },
    actions: null,
    events: [],
    money: [
      {
        scope: "household",
        before: beforeCash,
        income,
        expense,
        cap_overflow: Math.max(0, beforeCash + income - expense - 99999),
        after: state.cash,
      },
    ],
    observations: clone(state.observations),
    text,
    related: [],
    adult_result: null,
  };
}
function endGame(state: State, reason: "divorce" | "separation") {
  state.phase = "game_over";
  state.game_over = {
    reason,
    title: reason === "divorce" ? "離婚" : "一家離散",
    turn:
      state.n + (state.decisions!.special_answer && state.decisions!.themes.length === 0 ? 1 : 0),
    text:
      reason === "divorce"
        ? "父と母は別々の道を歩むことになった。この家庭での物語は、ここで幕を閉じる。"
        : "家族はそれぞれ家を離れた。一緒に暮らした日々を、この記録に残す。",
  };
  state.history.at(-1)?.text.push(state.game_over.text);
}
export function chooseDecision(state: State, eventInstance: string, optionId: string) {
  const d = state.decisions!;
  const theme = (!d.special_answer ? [d.special] : d.themes).find(
    (t) => instance(state, t) === eventInstance,
  );
  const option = theme?.options.find((o) => `${theme.id}:${o.id}` === optionId);
  if (!theme || !option || state.phase !== "childhood")
    throw new Error("現在の選択肢ではありません");
  if (d.special_answer) {
    d.selections[eventInstance] = optionId;
    return;
  }
  if (option.cost > state.cash) throw new Error("資金が足りません");
  const cash = state.cash;
  const income = choiceIncome(state, option);
  // 入金は一度だけ。パック由来の援助とは別に記録する。
  state.cash = Math.min(99999, state.cash - option.cost + income);
  const received = { income };
  const lines = applyOption(state, theme, option, received);
  if (dynamicMoney(state)) lines.push(moneyChange(cash, state.cash));
  d.special_answer = optionId;
  state.observations = observeChild(state);
  const entry = historyEntry(
    state,
    "special",
    lines,
    cash,
    dynamicMoney(state) ? received.income : state.cash - cash + option.cost,
    option.cost,
  );
  entry.events = [
    { instance_id: eventInstance, event_id: theme.id, option_id: optionId, text: theme.title },
  ];
  state.history.push(entry);
  d.event_history = clone(entry);
  if (option.end) endGame(state, option.end);
  else openThemes(state);
}
export function advanceDecisions(state: State) {
  const d = state.decisions!;
  const f = decisionForecast(state);
  if (!f.can_advance) throw new Error("3件すべての回答と資金を確認してください");
  const cash = state.cash;
  const previousStress = state.child.stress;
  state.cash = Math.min(99999, f.projected_cash);
  const config = { ...game(state) };
  if (tenPoint(state)) {
    config.fatigue_per_turn = pointDrift(config.fatigue_per_turn);
    config.stress_per_turn = pointDrift(config.stress_per_turn);
    config.couple_per_turn = pointDrift(config.couple_per_turn);
  }
  for (const p of PEOPLE) {
    d.fatigue[p] = clampParent(state, d.fatigue[p] + config.fatigue_per_turn);
    state.parents[p].stress = clampParent(
      state,
      state.parents[p].stress +
        config.stress_per_turn +
        (parentEquivalent(state, d.fatigue[p]) >= 70 ? (tenPoint(state) ? 1 : 2) : 0),
    );
    state.child.trust[p] = clampStat(state.child.trust[p] + config.trust_per_turn);
  }
  state.couple = clampParent(state, state.couple + config.couple_per_turn);
  if (state.n >= 12 && state.n < 36)
    for (const domain of ["study", "craft"] as const)
      state.child.ability[domain] = clampStat(state.child.ability[domain] + 1);
  state.plan.extra_action = "none";
  state.last_repair = false;
  const lines: string[] = [];
  const selections = d.themes.map((theme) => {
    const option = theme.options.find(
      (o) => `${theme.id}:${o.id}` === d.selections[instance(state, theme)],
    )!;
    lines.push(...applyOption(state, theme, option));
    return { title: theme.title, label: option.label };
  });
  for (const q of state.queue.filter((q) => q.due_turn === state.n + 1)) {
    applyDecisionEffect(
      state,
      q.id === "L-01" ? { B_target: 2 } : { X: -4, T: 2, G: -1 },
      q.target,
    );
    lines.push("以前の働きかけが、少しずつ実を結んだ。");
  }
  state.queue = state.queue.filter((q) => q.due_turn > state.n + 1);
  state.previous_plan = clone(state.plan);
  state.n++;
  for (const p of PEOPLE) {
    state.parents[p].age_months += 6;
    if (parentEquivalent(state, state.parents[p].stress) >= 80)
      state.parents[p].health = Math.max(tenPoint(state) ? 1 : 10, state.parents[p].health - 1);
    state.parents[p].regret = clampParent(
      state,
      state.parents[p].regret + (state.child.trust[p] < 30 ? (tenPoint(state) ? 1 : 2) : -1),
    );
  }
  d.crisis.divorce =
    parentEquivalent(state, state.couple) <= 10 &&
    parentEquivalent(state, state.parents.A.stress + state.parents.B.stress) / 2 >= 75
      ? d.crisis.divorce + 1
      : 0;
  d.crisis.separation =
    parentEquivalent(state, state.couple) <= 20 &&
    state.child.trust.A <= 15 &&
    state.child.trust.B <= 15
      ? d.crisis.separation + 1
      : 0;
  state.deltas.push(state.child.stress - previousStress);
  state.deltas = state.deltas.slice(-2);
  state.observations = observeChild(state);
  lines.push(`家族の様子：${familyStatus(state).label}。${familyStatus(state).description}`);
  if (dynamicMoney(state)) lines.push(moneyChange(cash, state.cash));
  const entry = historyEntry(state, "turn", lines, cash, f.income, f.cost);
  entry.decisions = selections;
  state.history.push(entry);
  if (d.crisis.separation >= 2) endGame(state, "separation");
  else if (d.crisis.divorce >= 2) endGame(state, "divorce");
  else if (state.n === 40) {
    state.answers = {};
    state.events = [];
    if (tenPoint(state)) scaleParents(state, 10);
    finish(state, draw);
    if (tenPoint(state)) {
      scaleParents(state, 0.1);
      for (const p of PEOPLE)
        state.result!.parents[p].health = Math.round(state.result!.parents[p].health / 10);
      for (const h of state.history)
        if (h.adult_result)
          for (const p of PEOPLE) {
            const result = h.adult_result.parents[p];
            if (result) result.health = Math.round(result.health / 10);
          }
    }
    const rename = (text: string) => text.replaceAll("親A", "父").replaceAll("親B", "母");
    for (const h of state.history.filter((h) => h.kind === "adult")) {
      h.text = h.text.map(rename);
      for (const event of h.events) event.text = rename(event.text);
    }
    if (state.result) state.result.story = state.result.story.map(rename);
    state.phase = "finished";
  } else openDecisionTurn(state);
}

function applyDecisionEffect(
  state: State,
  effects: Record<string, number | string>,
  target: "study" | "craft",
) {
  if (!tenPoint(state)) {
    applyEffect(state, effects, target);
    return;
  }
  const scaled = { ...effects };
  for (const [key, value] of Object.entries(scaled)) {
    if (typeof value !== "number" || key === "income" || key === "GM") continue;
    scaled[key] = ["S", "N", "F", "G", "GR"].includes(key) ? pointEffect(value) * 10 : value * 2;
  }
  scaleParents(state, 10);
  applyEffect(state, scaled, target);
  scaleParents(state, 0.1);
}
