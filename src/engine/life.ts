import { stageModel } from "./stage_state";
import {
  stageForecast,
  stageChoices,
  stageView,
  chooseStageLife,
  applyStageLife,
} from "./stage_life";
import { contentFor, difficultyFor } from "../content/catalog";
import type { LifeDecision, LifeOption, LifeRequirement } from "../content/life_schema";
import type { Choice, Forecast, State, PublicState } from "./types";
import { clone } from "./shared";
import { stage } from "./simulation";
import { applyStat, statLabel } from "./automatic_events";
import { annualIncome, meetsLifeRequirement } from "./life_requirements";
import { activeTreeEffects, treeEnabled } from "./tree_effects";

const config = (s: State) => contentFor(s).life_game!;
const instance = (s: State, id: string) => `t${String(s.n + 1).padStart(2, "0")}:${id}`;
const key = (node: LifeDecision, option: LifeOption) => `${node.id}:${option.id}`;
const inAge = (s: State, node: LifeDecision) =>
  s.n * 6 >= node.min_age_months && s.n * 6 <= node.max_age_months;
const routeGroup = (s: State, id?: string) =>
  config(s).route_groups?.find((group) => group.id === id);
function lastRouteFromHistory(s: State, groupId: string) {
  return config(s)
    .decisions.filter((node) => node.route_group === groupId && node.kind === "policy")
    .flatMap((node) =>
      node.options.flatMap((option) => {
        const history = s.life!.history[key(node, option)];
        return option.route && history
          ? [{ route: option.route, turn: history.last_turn, stage: node.route_stage ?? -1 }]
          : [];
      }),
    )
    .sort((a, b) => b.turn - a.turn || b.stage - a.stage)[0]?.route;
}
function currentRoute(s: State, groupId: string) {
  const prior = lastRouteFromHistory(s, groupId);
  if (!prior) return undefined;
  const active = config(s).decisions.find(
    (node) =>
      node.route_group === groupId &&
      node.kind === "policy" &&
      node.options.some((option) => option.route) &&
      inAge(s, node),
  );
  return (
    active?.options.find((option) => option.id === s.life!.policies[active.id])?.route ?? prior
  );
}
function selectedRoute(s: State, groupId: string, policies?: Record<string, string>) {
  const active = config(s).decisions.find(
    (node) =>
      node.route_group === groupId &&
      node.kind === "policy" &&
      node.options.some((option) => option.route) &&
      inAge(s, node),
  );
  if (active) {
    const selected = policies
      ? active.options.find((option) => option.id === policies[active.id])
      : plannedOption(s, active);
    if (selected?.route) return selected.route;
    const current = active.options.find((option) => option.id === s.life!.policies[active.id]);
    if (!currentRoute(s, groupId) && current?.route) return current.route;
  }
  return currentRoute(s, groupId);
}
function displayRoute(s: State, groupId: string) {
  const committed = currentRoute(s, groupId);
  if (committed || routeGroup(s, groupId)?.layout !== "branches") return committed ?? null;
  const policy = config(s).decisions.find(
    (node) =>
      node.route_group === groupId &&
      node.kind === "policy" &&
      node.options.some((option) => option.route),
  );
  return policy?.options.find((option) => option.id === s.life!.policies[policy.id])?.route ?? null;
}
function routeDetails(s: State, node: LifeDecision, option: LifeOption) {
  const group = routeGroup(s, node.route_group);
  if (!group) return [];
  if (option.route) {
    const previous = currentRoute(s, group.id);
    if (!previous || previous === option.route || s.life!.policies[node.id] === option.id)
      return [];
    const preparation = config(s).decisions.find((item) => item.id === group.switch_decision)!;
    const target = preparation.options.find((item) => item.switch_to === option.route)!;
    return [
      {
        label: `${group.label}「${group.routes.find((item) => item.id === option.route)!.label}」への切替準備を前期に実行`,
        met: s.life!.history[key(preparation, target)]?.last_turn === s.n,
      },
    ];
  }
  if (option.switch_to) {
    const previous = currentRoute(s, group.id);
    const nextAge = (s.n + 1) * 6;
    const nextStage = config(s).decisions.find(
      (item) =>
        item.route_group === group.id &&
        item.kind === "policy" &&
        item.options.some((option) => option.route) &&
        nextAge >= item.min_age_months &&
        nextAge <= item.max_age_months,
    );
    return [
      { label: `現在の${group.label}ルートがある`, met: !!previous },
      { label: "現在とは別のルートを選ぶ", met: !!previous && previous !== option.switch_to },
      {
        label: `次期に進める${group.label}段階がある`,
        met: !!nextStage?.options.some((item) => item.route === option.switch_to),
      },
    ];
  }
  if (node.route && !(node.kind === "policy" && option.id === node.default_option))
    return [
      {
        label: `${group.label}「${group.routes.find((item) => item.id === node.route)!.label}」を選択中`,
        met: selectedRoute(s, group.id) === node.route,
      },
    ];
  return [];
}
const referencesMet = (s: State, r?: LifeRequirement) =>
  meetsLifeRequirement(s, r ? { history: r.history, policies: r.policies } : undefined);
function offered(s: State, node: LifeDecision) {
  if (!inAge(s, node) || !referencesMet(s, node.requires)) return false;
  if (node.kind === "policy") return true;
  const history = node.options.flatMap((o) =>
    s.life!.history[key(node, o)] ? [s.life!.history[key(node, o)]] : [],
  );
  return (
    !history.length ||
    (!node.once && s.n + 1 - Math.max(...history.map((h) => h.last_turn)) >= node.cooldown)
  );
}
function plannedOption(s: State, node: LifeDecision) {
  const selection = s.decisions!.selections[instance(s, node.id)];
  return node.options.find((o) => key(node, o) === selection);
}
function currentCrossroad(s: State) {
  return config(s).crossroads?.find((item) => item.age_months === s.n * 6);
}
function crossroadMissing(s: State) {
  const crossroad = currentCrossroad(s);
  if (!crossroad) return [];
  return crossroad.required_decisions.filter((id) => {
    const node = config(s).decisions.find((item) => item.id === id)!;
    return !plannedOption(s, node);
  });
}
function resolvedPolicies(s: State, planned: boolean) {
  const policies = { ...s.life!.policies };
  const notices: string[] = [];
  const resolvedStages: string[] = [];
  if (treeEnabled(s))
    for (const node of config(s).decisions.filter(
      (item) =>
        item.kind === "policy" &&
        item.route_group &&
        item.route_stage !== undefined &&
        item.options.some((option) => option.route) &&
        item.min_age_months === s.n * 6 &&
        s.life!.route_stage_resolved?.[item.id] !== s.n &&
        !item.options.some((option) => s.life!.history[key(item, option)]),
    )) {
      resolvedStages.push(node.id);
      const previous = lastRouteFromHistory(s, node.route_group!);
      const continuing = node.options.find((option) => option.route === previous);
      if (!continuing || continuing.id === node.default_option) continue;
      const projected = { ...s, life: { ...s.life!, policies } };
      const otherPolicies = config(s)
        .decisions.filter((item) => item.kind === "policy" && item.id !== node.id && inAge(s, item))
        .flatMap((item) => item.options.filter((option) => option.id === policies[item.id]));
      const available =
        meetsLifeRequirement(projected, node.requires) &&
        meetsLifeRequirement(projected, continuing.requires) &&
        meetsLifeRequirement(projected, continuing.maintains) &&
        s.cash +
          config(s).income +
          continuing.income +
          otherPolicies.reduce((sum, option) => sum + option.income, 0) >=
          difficultyFor(s).living_cost +
            stage(s.n, s).cost +
            continuing.cost +
            otherPolicies.reduce((sum, option) => sum + option.cost, 0);
      if (available) policies[node.id] = continuing.id;
      else
        notices.push(
          `${node.title}：前の${routeGroup(s, node.route_group)?.label ?? "方針"}ルートの継続条件または家計を満たせないため、${node.options.find((option) => option.id === node.default_option)!.label}に進みます。`,
        );
    }
  if (planned)
    for (const node of config(s).decisions.filter((d) => d.kind === "policy")) {
      const option = plannedOption(s, node);
      if (option) policies[node.id] = option.id;
    }
  // 一つの支援の終了が別の方針へ波及する場合も、既定設定へ収束するまで処理する。
  for (let pass = 0; pass <= config(s).decisions.length; pass++) {
    let changed = false;
    const projected = { ...s, life: { ...s.life!, policies } };
    for (const node of config(s).decisions.filter((d) => d.kind === "policy")) {
      const option = node.options.find((o) => o.id === policies[node.id]);
      if (
        !option ||
        (option.id !== node.default_option &&
          (!inAge(s, node) ||
            (node.route && selectedRoute(s, node.route_group!, policies) !== node.route) ||
            !meetsLifeRequirement(projected, node.requires) ||
            !meetsLifeRequirement(projected, option.maintains)))
      ) {
        policies[node.id] = node.default_option!;
        notices.push(
          `${node.title}：対象期間または支援条件が変わったため、${node.options.find((o) => o.id === node.default_option)!.label}に戻ります。`,
        );
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { policies, notices, resolvedStages };
}
export function initializeLife(s: State) {
  if (stageModel(s)) {
    s.life = { stage_routes: {}, policies: {}, history: {}, visible: [], fresh: [], notices: [] };
    return;
  }
  s.life = {
    policies: Object.fromEntries(
      config(s)
        .decisions.filter((d) => d.kind === "policy")
        .map((d) => [d.id, d.default_option!]),
    ),
    history: {},
    ...(config(s).route_groups?.length ? { route_stage_resolved: {} } : {}),
    visible: [],
    fresh: [],
    notices: [],
  };
}
export function normalizeLife(s: State) {
  if (stageModel(s)) return;
  const resolved = resolvedPolicies(s, false);
  s.life!.policies = resolved.policies;
  if (s.life!.route_stage_resolved)
    for (const id of resolved.resolvedStages) s.life!.route_stage_resolved[id] = s.n;
  for (const notice of resolved.notices)
    if (!s.life!.notices.includes(notice)) s.life!.notices.push(notice);
}
export function openLife(s: State) {
  if (stageModel(s)) return;
  normalizeLife(s);
  if (treeEnabled(s)) {
    for (const node of config(s).decisions.filter(
      (d) => d.kind === "policy" && d.min_age_months === s.n * 6 && d.min_age_months > 0,
    )) {
      const label = node.options.find((o) => o.id === s.life!.policies[node.id])!.label;
      const notice = `${node.title}：変更しなければ「${label}」で進みます。`;
      if (!s.life!.notices.includes(notice)) s.life!.notices.push(notice);
    }
  }
  const visible = config(s)
    .decisions.filter((d) => offered(s, d))
    .flatMap((d) =>
      d.options
        .filter((o) =>
          treeEnabled(s)
            ? selectionReasons(s, d, o).length === 0
            : o.id === d.default_option || referencesMet(s, o.requires),
        )
        .map((o) => key(d, o)),
    );
  s.life!.fresh =
    s.n === 0
      ? []
      : [
          ...new Set(
            visible.filter((id) => !s.life!.visible.includes(id)).map((id) => id.split(":")[0]),
          ),
        ];
  s.life!.visible = visible;
}
function requirementDetails(s: State, requirement?: LifeRequirement) {
  const details: { label: string; met: boolean }[] = [];
  const label = (decision: string, option: string) => {
    const node = config(s).decisions.find((d) => d.id === decision)!;
    return `${node.title}「${node.options.find((o) => o.id === option)!.label}」`;
  };
  for (const r of requirement?.history ?? [])
    details.push({
      label: `${label(r.decision, r.option)}を確定${r.after ? `後${r.after}期経過` : "済み"}`,
      met: meetsLifeRequirement(s, { history: [r] }),
    });
  for (const r of requirement?.policies ?? [])
    details.push({
      label: `${label(r.decision, r.option)}を継続中`,
      met: meetsLifeRequirement(s, { policies: [r] }),
    });
  for (const r of requirement?.stats ?? [])
    details.push({
      label: `${r.path === "child.ability.study" ? "子どもの成績" : statLabel(r.path, true)} ${r.value}${r.op === "gte" ? "以上" : r.op === "lt" ? "未満" : "と同じ"}`,
      met: meetsLifeRequirement(s, { stats: [r] }),
    });
  if (requirement?.annual_income !== undefined)
    details.push({
      label: `年収 ${requirement.annual_income}万円以上（現在${annualIncome(s)}万円）`,
      met: annualIncome(s) >= requirement.annual_income,
    });
  return details;
}
function treeConditions(s: State, node: LifeDecision, option: LifeOption) {
  const fallback = node.kind === "policy" && option.id === node.default_option;
  const current = node.kind === "policy" && s.life!.policies[node.id] === option.id;
  const cost = option.cost + (node.kind === "policy" && !current ? option.setup_cost : 0);
  const details = [
    {
      label: `${node.min_age_months / 12}〜${Math.floor(node.max_age_months / 12)}歳`,
      met: inAge(s, node),
    },
  ];
  if (!fallback)
    details.push(
      ...requirementDetails(s, node.requires),
      ...requirementDetails(s, option.requires),
      ...requirementDetails(s, option.maintains),
    );
  details.push(...routeDetails(s, node, option));
  if (
    node.kind === "selection" &&
    inAge(s, node) &&
    referencesMet(s, node.requires) &&
    !offered(s, node)
  )
    details.push({
      label: node.once ? "取得済み（一度だけ）" : `再実行まで${node.cooldown}期の間隔が必要`,
      met: false,
    });
  if (cost && !fallback && !current)
    details.push({ label: `資金 ${cost}万円以上（現在${s.cash}万円）`, met: s.cash >= cost });
  return [...new Map(details.map((detail) => [detail.label, detail])).values()];
}
function selectionReasons(s: State, node: LifeDecision, option: LifeOption) {
  if (treeEnabled(s))
    return treeConditions(s, node, option)
      .filter((d) => !d.met)
      .map((d, i) => ({ code: `CONDITION_REQUIRED_${i}`, path: node.id, message: d.label }));
  if (node.kind === "policy" && option.id === node.default_option) return [];
  return offered(s, node) &&
    meetsLifeRequirement(s, node.requires) &&
    meetsLifeRequirement(s, option.requires) &&
    meetsLifeRequirement(s, option.maintains)
    ? []
    : [
        {
          code: "CONDITION_REQUIRED",
          path: node.id,
          message: "今の家族の状態では利用できません。支援や休息の条件を確認してください。",
        },
      ];
}
export function lifeForecast(s: State): Forecast {
  if (stageModel(s)) return stageForecast(s);
  const game = config(s);
  const reasons: Forecast["reasons"] = [];
  const resolved = resolvedPolicies(s, true);
  const livingCost = difficultyFor(s).living_cost;
  const stageCost = stage(s.n, s).cost;
  const cashFlow: NonNullable<Forecast["cash_flow"]> = [
    { label: "半年の基本収入", income: game.income },
    { label: "基本生活費", cost: livingCost },
  ];
  if (stageCost) cashFlow.push({ label: "年齢に応じた生活費", cost: stageCost });
  let cost = livingCost + stageCost;
  let income = game.income;
  let count = 0;
  const known = new Set<string>();
  for (const node of game.decisions) {
    known.add(instance(s, node.id));
    const selected = plannedOption(s, node);
    if (s.decisions!.selections[instance(s, node.id)] && !selected)
      reasons.push({
        code: "UNKNOWN_SELECTION",
        path: node.id,
        message: "現在の選択肢ではありません。予定を取り消してください。",
      });
    if (selected) reasons.push(...selectionReasons(s, node, selected));
    const option =
      node.kind === "policy"
        ? node.options.find((o) => o.id === resolved.policies[node.id])!
        : selected;
    if (
      !option ||
      (node.kind === "policy" &&
        (!inAge(s, node) ||
          !meetsLifeRequirement(
            { ...s, life: { ...s.life!, policies: resolved.policies } },
            node.requires,
          )))
    )
      continue;
    if (node.kind === "selection") count++;
    const setupCost =
      node.kind === "policy" && s.life!.policies[node.id] !== option.id ? option.setup_cost : 0;
    cost += option.cost + setupCost;
    income += option.income;
    if (option.income)
      cashFlow.push({ label: `${node.title}：${option.label}`, income: option.income });
    if (option.cost) cashFlow.push({ label: `${node.title}：${option.label}`, cost: option.cost });
    if (setupCost) cashFlow.push({ label: `${node.title}：開始費`, cost: setupCost });
  }
  if (Object.keys(s.decisions!.selections).some((id) => !known.has(id)))
    reasons.push({
      code: "UNKNOWN_SELECTION",
      path: "selections",
      message: "期限の切れた予定があります。予定を取り消してください。",
    });
  for (const id of crossroadMissing(s)) {
    const node = game.decisions.find((item) => item.id === id)!;
    reasons.push({
      code: "CROSSROAD_SELECTION_REQUIRED",
      path: node.id,
      message: `岐路の必須選択「${node.title}」を選んでください。`,
    });
  }
  if (count > game.max_selections)
    reasons.push({
      code: "SELECTION_LIMIT",
      path: "selections",
      message: `今期だけの選択は${game.max_selections}件までです。`,
    });
  if (s.cash + income < cost)
    reasons.push({
      code: "CASH_LIMIT",
      path: "cash",
      message: "半年後の資金が不足します。継続費や今期の予定を見直してください。",
    });
  return {
    income,
    cost,
    projected_cash: Math.min(99999, s.cash + income - cost),
    cash_flow: cashFlow,
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
function describe(option: LifeOption, policy: boolean, familyHome = false) {
  const effects = option.effects.map(
    (e) => `${statLabel(e.path, familyHome)} ${e.delta > 0 ? "+" : ""}${e.delta}`,
  );
  if (option.skill)
    effects.push(
      `${option.skill.parent === "A" ? "父" : "母"}の${{ dialogue: "対話", planning: "段取り", learning: "学びの支援" }[option.skill.ability]}が成果に影響`,
    );
  return [
    option.description,
    policy ? `継続費 ${option.cost}万円／半年・変更時 ${option.setup_cost}万円` : "今期のみ",
    ...effects,
  ].join(" ／ ");
}
export function lifeChoices(s: State): Choice[] {
  if (stageModel(s)) return stageChoices(s);
  if (s.phase !== "childhood") return [];
  return config(s)
    .decisions.filter((d) => treeEnabled(s) || offered(s, d))
    .map((node) => {
      const required = crossroadMissing(s).includes(node.id);
      return {
        kind: "decision",
        ...(treeEnabled(s)
          ? {
              tree: {
                min_age_months: node.min_age_months,
                default_label:
                  node.options.find((o) => o.id === node.default_option)?.label ?? null,
                ...(node.route_group ? { route_group: node.route_group } : {}),
                ...(node.route_stage !== undefined ? { route_stage: node.route_stage } : {}),
                ...(node.route ? { route: node.route } : {}),
                ...(node.tree_route ? { tree_route: node.tree_route } : {}),
                parents: [
                  ...new Map(
                    [node.requires, ...node.options.flatMap((o) => [o.requires, o.maintains])]
                      .flatMap((r) => [...(r?.history ?? []), ...(r?.policies ?? [])])
                      .filter((r) => r.decision !== node.id)
                      .map((r) => [
                        r.decision,
                        {
                          id: r.decision,
                          label: config(s).decisions.find((d) => d.id === r.decision)!.title,
                        },
                      ]),
                  ).values(),
                ],
              },
            }
          : {}),
        visual: null,
        instance_id: instance(s, node.id),
        event_id: node.id,
        text: node.title,
        menu: node.menu,
        selection_kind: node.kind,
        ...(required ? { crossroad_required: true } : {}),
        reason: node.reason,
        fresh: s.life!.fresh.includes(node.id),
        expires_age_months: node.max_age_months,
        ...(node.kind === "policy" && inAge(s, node) && !required
          ? { current_option: `${node.id}:${s.life!.policies[node.id]}` }
          : {}),
        ...(s.decisions!.selections[instance(s, node.id)]
          ? { selected_option: s.decisions!.selections[instance(s, node.id)] }
          : {}),
        options: [
          ...node.options
            .filter(
              (o) => treeEnabled(s) || o.id === node.default_option || referencesMet(s, o.requires),
            )
            .map((o) => {
              const reasons = selectionReasons(s, node, o);
              const parents = [
                ...new Map(
                  [node.requires, o.requires, o.maintains]
                    .flatMap((r) => [...(r?.history ?? []), ...(r?.policies ?? [])])
                    .filter((r) => r.decision !== node.id)
                    .map((r) => {
                      const parent = config(s).decisions.find((d) => d.id === r.decision)!;
                      const optionId = `${r.decision}:${r.option}`;
                      return [
                        optionId,
                        {
                          option_id: optionId,
                          label: `${parent.title}「${parent.options.find((item) => item.id === r.option)!.label}」`,
                        },
                      ] as const;
                    }),
                ).values(),
              ];
              // 組合せの家計超過は編集中に許容し、確定時に一括検査する。取消と安い方針への変更を妨げない。
              return {
                option_id: key(node, o),
                label: o.label,
                ...(treeEnabled(s)
                  ? { visual: contentFor(s).visuals[o.visual ?? "hero"], parents }
                  : {}),
                cost:
                  o.cost +
                  (node.kind === "policy" && o.id !== s.life!.policies[node.id] ? o.setup_cost : 0),
                income: o.income,
                description: describe(o, node.kind === "policy", treeEnabled(s)),
                ...(o.route ? { route: o.route } : {}),
                ...(o.tree_route ? { tree_route: o.tree_route } : {}),
                ...(o.switch_to ? { switch_to: o.switch_to } : {}),
                ...(treeEnabled(s)
                  ? {
                      acquired: !!s.life!.history[key(node, o)],
                      requirements: treeConditions(s, node, o).map(
                        (d) => `${d.met ? "✓" : "未達"} ${d.label}`,
                      ),
                      event_modifiers: o.event_modifiers ?? [],
                    }
                  : {}),
                available: reasons.length === 0,
                reasons,
              };
            }),
          {
            option_id: `${node.id}:cancel`,
            label: node.kind === "policy" ? "今期の変更を取り消す" : "今期は予定しない",
            cost: 0,
            income: 0,
            description: "現在の暮らしをそのまま続けます。",
            available: true,
            reasons: [],
          },
        ],
      };
    });
}
export function lifeView(s: State): NonNullable<PublicState["life"]> {
  if (stageModel(s)) return stageView(s);
  const resolved = resolvedPolicies(s, true);
  const crossroad = currentCrossroad(s);
  const missing = crossroadMissing(s);
  return {
    ...(treeEnabled(s)
      ? {
          selection_tree: true,
          annual_income: annualIncome(s),
          study_score: s.child.ability.study,
          active_effects: activeTreeEffects(s),
          route_groups: config(s).route_groups?.map((group) => ({
            id: group.id,
            label: group.label,
            ...(group.layout ? { layout: group.layout } : {}),
            ...(group.stage_labels ? { stage_labels: clone(group.stage_labels) } : {}),
            routes: clone(group.routes),
            current: displayRoute(s, group.id),
          })),
        }
      : {}),
    menus: clone(config(s).menus),
    max_selections: config(s).max_selections,
    selection_count: config(s).decisions.filter(
      (d) => d.kind === "selection" && plannedOption(s, d),
    ).length,
    crossroad: crossroad
      ? {
          label: crossroad.label,
          age_months: crossroad.age_months,
          missing: missing.map((id) => {
            const node = config(s).decisions.find((item) => item.id === id)!;
            return { decision_id: node.id, menu: node.menu, title: node.title };
          }),
        }
      : null,
    notices: [...new Set([...s.life!.notices, ...resolved.notices])],
    policies: config(s)
      .decisions.filter((d) => d.kind === "policy" && offered(s, d))
      .map((d) => {
        const current = d.options.find((o) => o.id === s.life!.policies[d.id])!;
        const planned = d.options.find((o) => o.id === resolved.policies[d.id])!;
        return {
          id: d.id,
          title: d.title,
          label: current.label,
          cost: current.cost,
          planned_label: planned.label,
          planned_cost: planned.cost,
        };
      }),
  };
}
export function chooseLife(s: State, eventInstance: string, optionId: string) {
  if (stageModel(s)) return chooseStageLife(s, eventInstance, optionId);
  const choice = lifeChoices(s).find((c) => c.instance_id === eventInstance);
  if (!choice?.options.some((o) => o.option_id === optionId && o.available))
    throw new Error("現在の選択肢ではありません");
  if (
    optionId.endsWith(":cancel") ||
    (optionId === choice.current_option && !choice.crossroad_required)
  )
    delete s.decisions!.selections[eventInstance];
  else s.decisions!.selections[eventInstance] = optionId;
}
function applyEffects(s: State, effects: LifeOption["effects"], lines: string[]) {
  for (const effect of effects) {
    const { previous, current } = applyStat(s, effect);
    if (previous !== current)
      lines.push(
        `${statLabel(effect.path, treeEnabled(s))} ${current > previous ? "+" : ""}${current - previous}`,
      );
  }
}
export function applyLife(s: State, lines: string[]) {
  if (stageModel(s)) return applyStageLife(s, lines);
  const resolved = resolvedPolicies(s, true);
  const before = clone(s);
  s.life!.policies = resolved.policies;
  lines.push("普段の暮らし：日々の休息・交流・学びを続けた。", ...resolved.notices);
  applyEffects(s, config(s).standard_effects, lines);
  const selections: { title: string; label: string }[] = [];
  for (const node of config(s).decisions) {
    const option =
      node.kind === "policy"
        ? node.options.find((o) => o.id === resolved.policies[node.id])
        : plannedOption(before, node);
    if (
      !option ||
      (node.kind === "policy" &&
        (!inAge(before, node) ||
          !meetsLifeRequirement(
            { ...before, life: { ...before.life!, policies: resolved.policies } },
            node.requires,
          )))
    )
      continue;
    lines.push(
      `${node.kind === "policy" ? "続けた暮らし" : "今期の選択"}：${node.title} → ${option.label}`,
    );
    applyEffects(s, option.effects, lines);
    if (option.skill) {
      const { parent, ability, target, gain } = option.skill;
      const amount = Math.max(
        0,
        gain +
          Math.floor(before.decisions!.skills[parent][ability] / 3) -
          (before.decisions!.fatigue[parent] >= 7 ? 2 : 0),
      );
      applyEffects(s, [{ path: target, delta: amount }], lines);
    }
    const id = key(node, option);
    const history = s.life!.history[id];
    s.life!.history[id] = {
      first_turn: history?.first_turn ?? s.n + 1,
      last_turn: s.n + 1,
      count: (history?.count ?? 0) + 1,
    };
    selections.push({ title: node.title, label: option.label });
    if (option.repair) {
      s.repaired = true;
      s.last_repair = true;
    }
  }
  return selections;
}
