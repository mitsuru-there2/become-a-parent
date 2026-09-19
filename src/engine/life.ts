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
function resolvedPolicies(s: State, planned: boolean) {
  const policies = { ...s.life!.policies };
  if (planned)
    for (const node of config(s).decisions.filter((d) => d.kind === "policy")) {
      const option = plannedOption(s, node);
      if (option) policies[node.id] = option.id;
    }
  const notices: string[] = [];
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
  return { policies, notices };
}
export function initializeLife(s: State) {
  s.life = {
    policies: Object.fromEntries(
      config(s)
        .decisions.filter((d) => d.kind === "policy")
        .map((d) => [d.id, d.default_option!]),
    ),
    history: {},
    visible: [],
    fresh: [],
    notices: [],
  };
}
export function normalizeLife(s: State) {
  const resolved = resolvedPolicies(s, false);
  s.life!.policies = resolved.policies;
  s.life!.notices.push(...resolved.notices);
}
export function openLife(s: State) {
  normalizeLife(s);
  if (treeEnabled(s)) {
    for (const node of config(s).decisions.filter(
      (d) => d.kind === "policy" && d.min_age_months === s.n * 6 && d.min_age_months > 0,
    )) {
      const label = node.options.find((o) => o.id === node.default_option)!.label;
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
  if (
    node.kind === "action" &&
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
  const game = config(s);
  const reasons: Forecast["reasons"] = [];
  const resolved = resolvedPolicies(s, true);
  let cost = difficultyFor(s).living_cost + stage(s.n, s).cost;
  let income = game.income;
  let count = 0;
  const known = new Set<string>();
  for (const node of game.decisions) {
    known.add(instance(s, node.id));
    const selected = plannedOption(s, node);
    if (s.decisions!.selections[instance(s, node.id)] && !selected)
      reasons.push({
        code: "UNKNOWN_ACTION",
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
    if (node.kind === "action") count++;
    cost +=
      option.cost +
      (node.kind === "policy" && s.life!.policies[node.id] !== option.id ? option.setup_cost : 0);
    income += option.income;
  }
  if (Object.keys(s.decisions!.selections).some((id) => !known.has(id)))
    reasons.push({
      code: "UNKNOWN_ACTION",
      path: "selections",
      message: "期限の切れた予定があります。予定を取り消してください。",
    });
  if (count > game.max_actions)
    reasons.push({
      code: "ACTION_LIMIT",
      path: "actions",
      message: `今期だけの行動は${game.max_actions}件までです。`,
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
  if (s.phase !== "childhood") return [];
  return config(s)
    .decisions.filter((d) => treeEnabled(s) || offered(s, d))
    .map((node) => ({
      kind: "decision",
      ...(treeEnabled(s)
        ? {
            tree: {
              min_age_months: node.min_age_months,
              default_label: node.options.find((o) => o.id === node.default_option)?.label ?? null,
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
      decision_kind: node.kind,
      reason: node.reason,
      fresh: s.life!.fresh.includes(node.id),
      expires_age_months: node.max_age_months,
      ...(node.kind === "policy"
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
    }));
}
export function lifeView(s: State): NonNullable<PublicState["life"]> {
  const resolved = resolvedPolicies(s, true);
  return {
    ...(treeEnabled(s)
      ? {
          action_tree: true,
          annual_income: annualIncome(s),
          study_score: s.child.ability.study,
          active_effects: activeTreeEffects(s),
        }
      : {}),
    menus: clone(config(s).menus),
    max_actions: config(s).max_actions,
    action_count: config(s).decisions.filter((d) => d.kind === "action" && plannedOption(s, d))
      .length,
    notices: [...s.life!.notices, ...resolved.notices],
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
  const choice = lifeChoices(s).find((c) => c.instance_id === eventInstance);
  if (!choice?.options.some((o) => o.option_id === optionId && o.available))
    throw new Error("現在の選択肢ではありません");
  if (optionId.endsWith(":cancel") || optionId === choice.current_option)
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
      `${node.kind === "policy" ? "続けた暮らし" : "今期の行動"}：${node.title} → ${option.label}`,
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
