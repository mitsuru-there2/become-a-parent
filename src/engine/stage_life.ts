import { contentFor, difficultyFor } from "../content/catalog";
import type { LifeDecision, LifeOption, LifeRequirement } from "../content/life_schema";
import type { Choice, Forecast, PublicState, State } from "./types";
import { clone } from "./shared";
import { applyStat, statLabel } from "./automatic_events";
import { observeChild, stage } from "./simulation";
import { annualIncome, meetsLifeRequirement } from "./life_requirements";
import { activeStageEffects, routeAtStage, stageIndex, stageRouteId } from "./stage_state";

const config = (s: State) => contentFor(s).life_game!;
const instance = (s: State, id: string) => `t${String(s.n + 1).padStart(2, "0")}:${id}`;
const key = (node: LifeDecision, option: LifeOption) => `${node.id}:${option.id}`;
const stageLabel = (index: number) => `${index * 4}〜${index * 4 + 3}歳`;
const isCrossroad = (s: State) => s.n % 8 === 0 && s.phase === "childhood";
const missingGroups = (s: State) => config(s).route_groups!.filter((g) => !routeAtStage(s, g.id));

function conditions(s: State, requirement?: LifeRequirement) {
  const results: { label: string; met: boolean }[] = [];
  const label = (id: string, option: string) => {
    const node = config(s).decisions.find((n) => n.id === id)!;
    return `${node.title}「${node.options.find((o) => o.id === option)!.label}」`;
  };
  for (const r of requirement?.history ?? [])
    results.push({
      label: `${label(r.decision, r.option)}を取得${r.after ? `後${r.after}ターン経過` : "済み"}`,
      met: meetsLifeRequirement(s, { history: [r] }),
    });
  for (const r of requirement?.policies ?? [])
    results.push({
      label: `${label(r.decision, r.option)}の継続効果が有効`,
      met: meetsLifeRequirement(s, { policies: [r] }),
    });
  for (const r of requirement?.stats ?? [])
    results.push({
      label: `${statLabel(r.path, true)} ${r.value}${r.op === "gte" ? "以上" : r.op === "lt" ? "未満" : "と同じ"}`,
      met: meetsLifeRequirement(s, { stats: [r] }),
    });
  if (requirement?.annual_income !== undefined)
    results.push({
      label: `年収 ${requirement.annual_income}万円以上（現在${annualIncome(s)}万円）`,
      met: meetsLifeRequirement(s, { annual_income: requirement.annual_income }),
    });
  return results;
}
const reasonsFrom = (details: { label: string; met: boolean }[], path: string) =>
  details
    .filter((d) => !d.met)
    .map((d) => ({ code: "CONDITION_REQUIRED", path, message: d.label }));
const effectDescription = (effects: LifeOption["effects"]) =>
  effects.map((e) => `${statLabel(e.path, true)} ${e.delta > 0 ? "+" : ""}${e.delta}`).join("、");
function effectDetails(
  option: LifeOption,
): NonNullable<Choice["options"][number]["effect_details"]> {
  const details: NonNullable<Choice["options"][number]["effect_details"]> = [
    {
      duration: "instant",
      description: [
        `支出 ${option.cost}万円`,
        ...(option.income ? [`入金 ${option.income}万円`] : []),
        effectDescription(option.effects),
        ...(option.skill
          ? [`${option.skill.parent === "A" ? "父" : "母"}の支援能力に応じた成長`]
          : []),
      ]
        .filter(Boolean)
        .join(" ／ "),
    },
  ];
  for (const duration of ["stage", "permanent"] as const) {
    const effect = duration === "stage" ? option.stage_effect : option.permanent_effect;
    if (!effect) continue;
    details.push({
      duration,
      description: [
        `毎期の支出 ${effect.cost}万円・入金 ${effect.income}万円`,
        effectDescription(effect.effects),
        ...(effect.event_modifiers ?? []).map(
          (m) =>
            `${m.label}：${m.kind === "good" ? "良い" : "悪い"}イベント効果 ${m.percent > 0 ? "+" : ""}${m.percent}%`,
        ),
      ]
        .filter(Boolean)
        .join(" ／ "),
    });
  }
  return details;
}
export function stageForecast(s: State): Forecast {
  const game = config(s);
  const baseCost = difficultyFor(s).living_cost + stage(s.n, s).cost;
  let cost = baseCost;
  let income = game.income;
  const cashFlow: NonNullable<Forecast["cash_flow"]> = [
    { label: "半年の基本収入", income },
    { label: "基本生活費・年齢に応じた生活費", cost },
  ];
  for (const { effect, source, duration } of activeStageEffects(s)) {
    cost += effect.cost;
    income += effect.income;
    if (effect.cost || effect.income)
      cashFlow.push({
        label: `${source}（${duration === "stage" ? "ステージ中" : "恒久"}）`,
        cost: effect.cost,
        income: effect.income,
      });
  }
  const reasons: Forecast["reasons"] = missingGroups(s).map((g) => ({
    code: "CROSSROAD_SELECTION_REQUIRED",
    path: stageRouteId(g.id),
    message: `岐路のルート「${game.menus.find((m) => m.id === g.menu)!.label}」を確定してください。`,
  }));
  if (s.cash + income < cost)
    reasons.push({
      code: "CASH_LIMIT",
      path: "cash",
      message: "半年後の資金が不足します。収入を得られる選択を確認してください。",
    });
  return {
    income,
    cost,
    cash_flow: cashFlow,
    projected_cash: Math.min(99999, s.cash + income - cost),
    can_advance: s.phase === "childhood" && reasons.length === 0,
    reasons,
    time_used: { A: 0, B: 0 },
    time_limit: 0,
    care_required: 0,
    care_allocated: 0,
    uncertain_expense_cap: 0,
    fallback_plan: clone(s.plan),
  };
}
export function stageChoices(s: State): Choice[] {
  if (s.phase !== "childhood") return [];
  const game = config(s);
  const index = stageIndex(s);
  const forecast = stageForecast(s);
  const routeChoices: Choice[] = game.route_groups!.map((group) => {
    const id = stageRouteId(group.id);
    const current = routeAtStage(s, group.id);
    const previous = index ? routeAtStage(s, group.id, index - 1) : undefined;
    const title = game.menus.find((menu) => menu.id === group.menu)!.label;
    return {
      kind: "decision",
      route_choice: true,
      menu: group.menu,
      selection_kind: "policy",
      visual: null,
      instance_id: instance(s, id),
      event_id: id,
      text: `${title}のルート`,
      crossroad_required: !current,
      ...(current ? { current_option: `${id}:${current}` } : {}),
      options: group.routes.map((route) => {
        const changed = !!previous && previous !== route.id;
        const cost = changed ? group.switch_cost! : 0;
        const details = [
          { label: "岐路でのみ確定できます", met: isCrossroad(s) },
          { label: "このステージのルートは未確定です", met: !current },
          { label: `変更費用 ${cost}万円（現在${s.cash}万円）`, met: s.cash >= cost },
          {
            label: "変更後も今期の継続費を支払えます",
            met: !cost || forecast.projected_cash >= cost,
          },
        ];
        return {
          option_id: `${id}:${route.id}`,
          label: route.label,
          route: route.id,
          cost,
          income: 0,
          description: changed
            ? `ルート変更：${cost}万円 ／ ${effectDescription(group.switch_effects!)}。確定後は次の岐路まで変更できません。`
            : `${previous ? "同じルートを継続" : "初回のルート選択"}：無料。確定後は次の岐路まで変更できません。`,
          requirements: details.map((d) => `${d.met ? "✓" : "未達"} ${d.label}`),
          acquired: current === route.id,
          available: details.every((d) => d.met),
          reasons: reasonsFrom(details, id),
        };
      }),
    };
  });
  return [
    ...routeChoices,
    ...game.decisions.map((node): Choice => {
      const group = game.route_groups!.find((g) => g.id === node.route_group)!;
      const current = routeAtStage(s, group.id);
      return {
        kind: "decision",
        visual: null,
        instance_id: instance(s, node.id),
        event_id: node.id,
        text: node.title,
        menu: node.menu,
        selection_kind: "selection",
        reason: node.reason,
        stages: node.stages,
        expires_age_months: node.max_age_months,
        tree: {
          min_age_months: node.min_age_months,
          default_label: null,
          route_group: group.id,
          route_stage: index,
          parents: [],
        },
        options: node.options.map((option) => {
          const id = key(node, option);
          const acquired = !!s.life!.history[id];
          const ongoingNet = [option.stage_effect, option.permanent_effect].reduce(
            (sum, effect) => sum + (effect ? effect.cost - effect.income : 0),
            0,
          );
          const details = [
            {
              label: `対象ステージ：${node.stages!.map(stageLabel).join("、")}`,
              met: node.stages!.includes(index),
            },
            {
              label: `対象ルート：${group.routes
                .filter((r) => option.routes!.includes(r.id))
                .map((r) => r.label)
                .join("、")}`,
              met: !!current && option.routes!.includes(current),
            },
            { label: acquired ? "取得済み（一度限り）" : "未取得", met: !acquired },
            ...conditions(s, node.requires),
            ...conditions(s, option.requires),
            {
              label: `取得費用 ${option.cost}万円（現在${s.cash}万円）`,
              met: s.cash >= option.cost,
            },
          ];
          if (option.cost > option.income || ongoingNet > 0)
            details.push({
              label: "取得後も今期の継続費を支払えます",
              met:
                Math.min(99999, s.cash - option.cost + option.income) +
                  forecast.income -
                  forecast.cost -
                  ongoingNet >=
                0,
            });
          return {
            option_id: id,
            label: option.label,
            cost: option.cost,
            income: option.income,
            description: option.description,
            visual: contentFor(s).visuals[option.visual ?? "hero"],
            routes: option.routes,
            effect_details: effectDetails(option),
            acquired,
            requirements: details.map((d) => `${d.met ? "✓" : "未達"} ${d.label}`),
            available: details.every((d) => d.met),
            reasons: reasonsFrom(details, node.id),
          };
        }),
      };
    }),
  ];
}
export function stageView(s: State): NonNullable<PublicState["life"]> {
  const game = config(s);
  const index = stageIndex(s);
  const active = activeStageEffects(s);
  return {
    stage_model: true,
    selection_tree: true,
    stage: {
      index,
      label: stageLabel(index),
      start_age_months: index * 48,
      end_age_months: (index + 1) * 48,
    },
    stages: Array.from({ length: 5 }, (_, i) => ({ index: i, label: stageLabel(i) })),
    annual_income: annualIncome(s),
    study_score: s.child.ability.study,
    active_effects: active.flatMap(({ effect, source, duration }) =>
      (effect.event_modifiers ?? []).map((m) => ({
        ...m,
        source: `${source}（${duration === "stage" ? "ステージ中" : "恒久"}）`,
      })),
    ),
    route_groups: game.route_groups!.map((group) => ({
      id: group.id,
      menu: group.menu,
      label: group.label,
      routes: clone(group.routes),
      current: routeAtStage(s, group.id) ?? null,
      previous: index ? (routeAtStage(s, group.id, index - 1) ?? null) : null,
      chosen_stages: Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [String(i), routeAtStage(s, group.id, i)]).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    })),
    menus: clone(game.menus),
    max_selections: 0,
    selection_count: Object.keys(s.life!.history).length,
    crossroad: isCrossroad(s)
      ? {
          label: game.crossroads![index].label,
          age_months: index * 48,
          missing: missingGroups(s).map((g) => ({
            decision_id: stageRouteId(g.id),
            menu: g.menu,
            title: `${game.menus.find((m) => m.id === g.menu)!.label}のルート`,
          })),
        }
      : null,
    notices: [],
    policies: active.map(({ node, option, effect, duration }) => ({
      id: `${node.id}:${option.id}:${duration}`,
      title: `${node.title}（${duration === "stage" ? "ステージ中" : "恒久"}）`,
      label: option.label,
      cost: effect.cost,
      planned_label: option.label,
      planned_cost: effect.cost,
    })),
  };
}
function applyEffects(s: State, effects: LifeOption["effects"], lines: string[]) {
  for (const effect of effects) {
    const { previous, current } = applyStat(s, effect);
    if (previous !== current) lines.push(`${statLabel(effect.path, true)} ${previous}→${current}`);
  }
}
export function chooseStageLife(s: State, eventInstance: string, optionId: string) {
  const choice = stageChoices(s).find((c) => c.instance_id === eventInstance);
  const option = choice?.options.find((o) => o.option_id === optionId);
  if (!choice || !option?.available)
    throw new Error(option?.reasons[0]?.message ?? "現在の選択肢ではありません");
  const before = s.cash;
  s.cash = Math.min(99999, s.cash - option.cost + option.income);
  const lines = [
    `${choice.route_choice ? "ルート確定" : "選択取得"}：${choice.text} → ${option.label}`,
  ];
  if (choice.route_choice) {
    const group = config(s).route_groups!.find((g) => stageRouteId(g.id) === choice.event_id)!;
    const previous = stageIndex(s) ? routeAtStage(s, group.id, stageIndex(s) - 1) : undefined;
    if (previous && previous !== option.route) applyEffects(s, group.switch_effects!, lines);
    s.life!.stage_routes![`${stageIndex(s)}:${group.id}`] = option.route!;
  } else {
    const node = config(s).decisions.find((n) => n.id === choice.event_id)!;
    const item = node.options.find((o) => key(node, o) === optionId)!;
    applyEffects(s, item.effects, lines);
    if (item.skill) {
      const { parent, ability, target, gain } = item.skill;
      applyEffects(
        s,
        [
          {
            path: target,
            delta: Math.max(
              0,
              gain +
                Math.floor(s.decisions!.skills[parent][ability] / 3) -
                (s.decisions!.fatigue[parent] >= 7 ? 2 : 0),
            ),
          },
        ],
        lines,
      );
    }
    s.life!.history[optionId] = { first_turn: s.n + 1, last_turn: s.n + 1, count: 1 };
    if (item.repair) {
      s.repaired = true;
      s.last_repair = true;
    }
  }
  if (s.cash !== before) lines.push(`資金 ${before}→${s.cash}万円`);
  s.observations = observeChild(s);
  s.history.push({
    index: s.history.length,
    kind: "special",
    turn: s.n + 1,
    adult_step: null,
    ages: {
      child_months: s.n * 6,
      A_months: s.parents.A.age_months,
      B_months: s.parents.B.age_months,
    },
    selections: null,
    events: [
      {
        instance_id: eventInstance,
        event_id: choice.event_id,
        option_id: optionId,
        text: choice.text,
      },
    ],
    money: [
      {
        scope: "household",
        before,
        income: option.income,
        expense: option.cost,
        cap_overflow: Math.max(0, before - option.cost + option.income - 99999),
        after: s.cash,
      },
    ],
    observations: clone(s.observations),
    text: lines,
    related: [],
    adult_result: null,
  });
}
export function applyStageLife(s: State, lines: string[]) {
  const active = activeStageEffects(s);
  lines.push("普段の暮らし：日々の休息・交流・学びを続けた。");
  applyEffects(s, config(s).standard_effects, lines);
  for (const { effect, source, duration } of active) {
    lines.push(`${duration === "stage" ? "ステージ" : "恒久"}効果：${source}`);
    applyEffects(s, effect.effects, lines);
  }
  return active.map(({ node, option }) => ({ title: node.title, label: option.label }));
}
