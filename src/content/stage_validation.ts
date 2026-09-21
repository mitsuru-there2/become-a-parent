import type { Content } from "./types";
import type { LifeRequirement } from "./life_schema";

/** Current stage content is checked independently from the retired policy tree. */
export function validateStageContent(
  content: Content,
  ensure: (ok: unknown, path: string) => void,
) {
  const game = content.life_game!;
  ensure(game.max_selections === 0, "stage_model: 選択数の上限はありません");
  const groups = game.route_groups ?? [];
  const crossroads = game.crossroads ?? [];
  ensure(game.selection_tree && game.initial_family_home, "stage_model: 実家とツリーが必要です");
  ensure(content.decision_game && content.automatic_events, "stage_model: 基本設定が必要です");
  ensure(
    !JSON.stringify([game.decisions, content.automatic_events]).includes("grandparents.members."),
    "stage_model: 実家は共通状態です",
  );
  const menus = new Set(game.menus.map((menu) => menu.id));
  ensure(menus.size === 5 && game.menus.length === 5, "stage_model: 判断カテゴリは5分類です");
  ensure(
    groups.length === 5 &&
      new Set(groups.map((g) => g.id)).size === 5 &&
      new Set(groups.map((g) => g.menu)).size === 5,
    "stage_model: カテゴリごとにルート群が必要です",
  );
  for (const group of groups) {
    ensure(menus.has(group.menu), `${group.id}.menu`);
    ensure(
      group.switch_cost !== undefined && group.switch_effects && !group.switch_decision,
      `${group.id}: 変更ペナルティが必要です`,
    );
    ensure(
      new Set(group.routes.map((r) => r.id)).size === group.routes.length,
      `${group.id}.routes: ID重複`,
    );
  }
  ensure(crossroads.length === 5, "stage_model: 5つの岐路が必要です");
  crossroads.forEach((crossroad, index) => {
    ensure(crossroad.age_months === index * 48, "stage_model: 岐路は0・4・8・12・16歳です");
    ensure(
      crossroad.required_decisions.length === groups.length &&
        groups.every((g) => crossroad.required_decisions.includes(`crossroad-${g.id}`)),
      "stage_model: 岐路に全カテゴリが必要です",
    );
  });
  ensure(
    game.income >=
      Math.max(...Object.values(content.difficulties).map((d) => d.living_cost)) +
        Math.max(...content.stages.map((s) => s.cost)),
    "stage_model: 標準生活の収入が必要です",
  );
  const nodes = new Map(game.decisions.map((node) => [node.id, node]));
  ensure(nodes.size === game.decisions.length, "stage_model: 判断ID重複");
  const requirements: LifeRequirement[] = (content.automatic_events ?? []).flatMap((e) =>
    e.requires ? [e.requires] : [],
  );
  for (const node of game.decisions) {
    const group = groups.find((g) => g.id === node.route_group);
    ensure(group && group.menu === node.menu, `${node.id}: 判断カテゴリとルート群が一致しません`);
    ensure(
      node.stages?.length && new Set(node.stages).size === node.stages.length,
      `${node.id}.stages`,
    );
    ensure(
      node.stages &&
        node.min_age_months === Math.min(...node.stages) * 48 &&
        node.max_age_months === (Math.max(...node.stages) + 1) * 48 - 1,
      `${node.id}: 対象ステージと年齢が一致しません`,
    );
    ensure(
      node.kind === "selection" && node.once && node.default_option === null,
      `${node.id}: 選択は一度限りです`,
    );
    ensure(
      new Set(node.options.map((o) => o.id)).size === node.options.length &&
        !node.id.startsWith("crossroad-"),
      `${node.id}: ID重複または予約ID`,
    );
    if (node.requires) requirements.push(node.requires);
    for (const option of node.options) {
      ensure(
        option.id !== "cancel" &&
          option.setup_cost === 0 &&
          !option.maintains &&
          !option.route &&
          !option.switch_to,
        `${node.id}.${option.id}: 旧方針設定は使用できません`,
      );
      ensure(
        option.routes?.length &&
          new Set(option.routes).size === option.routes.length &&
          option.routes.every((id) => group?.routes.some((r) => r.id === id)),
        `${node.id}.${option.id}.routes`,
      );
      ensure(
        !option.event_modifiers && !option.income_reduction,
        `${node.id}.${option.id}: 継続効果には持続期間が必要です`,
      );
      ensure(!option.visual || content.visuals[option.visual], `${node.id}.${option.id}.visual`);
      if (option.requires) requirements.push(option.requires);
      for (const effect of [option.stage_effect, option.permanent_effect])
        if (effect)
          ensure(
            (effect.income_reduction ?? 0) <= effect.cost,
            `${node.id}.${option.id}: 減収は費用にも含めます`,
          );
    }
  }
  for (const requirement of requirements) {
    for (const ref of [...(requirement.history ?? []), ...(requirement.policies ?? [])])
      ensure(
        nodes.get(ref.decision)?.options.some((o) => o.id === ref.option),
        `stage_model.reference.${ref.decision}:${ref.option}`,
      );
    for (const ref of requirement.policies ?? []) {
      const option = nodes.get(ref.decision)?.options.find((o) => o.id === ref.option);
      ensure(
        option?.stage_effect || option?.permanent_effect,
        `${ref.decision}:${ref.option}: 継続効果がありません`,
      );
    }
  }
  const reachable = new Set<string>();
  const possible = (r?: LifeRequirement) =>
    [...(r?.history ?? []), ...(r?.policies ?? [])].every((ref) =>
      reachable.has(`${ref.decision}:${ref.option}`),
    );
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of game.decisions) {
      if (!possible(node.requires)) continue;
      for (const option of node.options) {
        const id = `${node.id}:${option.id}`;
        if (!reachable.has(id) && possible(option.requires)) {
          reachable.add(id);
          changed = true;
        }
      }
    }
  }
  for (const node of game.decisions)
    for (const option of node.options)
      ensure(
        reachable.has(`${node.id}:${option.id}`),
        `stage_model.unreachable.${node.id}:${option.id}`,
      );
}
