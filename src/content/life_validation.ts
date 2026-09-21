import type { Content } from "./types";
import type { LifeRequirement } from "./life_schema";

export function validateLifeContent(content: Content, ensure: (ok: unknown, path: string) => void) {
  const game = content.life_game;
  const eventRequirements =
    content.automatic_events?.flatMap((e) => (e.requires ? [e.requires] : [])) ?? [];
  if (!game) {
    ensure(eventRequirements.length === 0, "automatic_events.requires: life_gameが必要です");
    return;
  }
  if (game.action_tree) {
    ensure(game.initial_family_home, "life_game.initial_family_home: 実家の初期状態が必要です");
    ensure(
      !JSON.stringify([game.decisions, content.automatic_events]).includes("grandparents.members."),
      "life_game: 実家は共通パラメータを使用します",
    );
  } else
    ensure(
      game.initial_grandparents,
      "life_game.initial_grandparents: 旧ルールの初期状態が必要です",
    );
  ensure(
    content.decision_game?.initial_grandparents && content.automatic_events,
    "life_game: 家族と自動イベント設定が必要です",
  );
  ensure(
    game.income >=
      Math.max(...Object.values(content.difficulties).map((d) => d.living_cost)) +
        Math.max(...content.stages.map((s) => s.cost)),
    "life_game.income: 全年代・難易度で標準生活の費用を賄う収入が必要です",
  );
  const menus = new Set(game.menus.map((m) => m.id));
  ensure(menus.size === game.menus.length, "life_game.menus: ID重複");
  const nodes = new Map(game.decisions.map((d) => [d.id, d]));
  ensure(nodes.size === game.decisions.length, "life_game.decisions: ID重複");
  const groups = new Map((game.route_groups ?? []).map((group) => [group.id, group]));
  ensure(groups.size === (game.route_groups?.length ?? 0), "life_game.route_groups: ID重複");
  for (const group of groups.values()) {
    ensure(menus.has(group.menu), `${group.id}.menu`);
    const routeIds = new Set(group.routes.map((route) => route.id));
    ensure(routeIds.size === group.routes.length, `${group.id}.routes: ID重複`);
    const switchNode = nodes.get(group.switch_decision);
    ensure(
      switchNode?.kind === "action" &&
        switchNode.route_group === group.id &&
        switchNode.menu === group.menu,
      `${group.id}.switch_decision`,
    );
    ensure(
      switchNode?.options.length === routeIds.size &&
        new Set(switchNode.options.map((option) => option.switch_to)).size === routeIds.size &&
        switchNode.options.every((option) => option.switch_to && routeIds.has(option.switch_to)),
      `${group.id}.switch_decision.options`,
    );
    const stages = game.decisions
      .filter(
        (node) =>
          node.route_group === group.id &&
          node.route_stage !== undefined &&
          node.kind === "policy" &&
          node.options.some((option) => option.route),
      )
      .sort((a, b) => a.route_stage! - b.route_stage!);
    ensure(stages.length > 0, `${group.id}.stages`);
    if (group.layout === "branches") {
      ensure(
        stages.length === 1 &&
          stages[0].route_stage === 0 &&
          stages[0].min_age_months === 0 &&
          stages[0].max_age_months === 239 &&
          group.stage_labels?.length === 5,
        `${group.id}.branch_stages`,
      );
    }
    stages.forEach((node, index) => {
      ensure(node.route_stage === index, `${node.id}.route_stage`);
      ensure(node.menu === group.menu, `${node.id}.menu`);
      ensure(
        node.options.length === routeIds.size &&
          new Set(node.options.map((option) => option.route)).size === routeIds.size &&
          node.options.every((option) => option.route && routeIds.has(option.route)),
        `${node.id}.routes`,
      );
      if (index)
        ensure(stages[index - 1].max_age_months + 1 === node.min_age_months, `${node.id}.age`);
    });
  }
  const requirements: LifeRequirement[] = [...eventRequirements];
  for (const node of game.decisions) {
    ensure(menus.has(node.menu), `${node.id}.menu`);
    if (node.route_group) {
      const group = groups.get(node.route_group);
      ensure(group, `${node.id}.route_group`);
      if (node.route)
        ensure(
          node.route_stage !== undefined && group?.routes.some((route) => route.id === node.route),
          `${node.id}.route`,
        );
      if (node.route && node.kind === "action" && group?.layout !== "branches") {
        const prior = game.decisions
          .filter(
            (item) =>
              item.route_group === node.route_group &&
              item.kind === "policy" &&
              item.options.some((option) => option.route) &&
              item.route_stage! <= node.route_stage!,
          )
          .sort((a, b) => b.route_stage! - a.route_stage!)[0];
        const priorOption = prior?.options.find((option) => option.route === node.route);
        const references =
          node.route_stage === prior?.route_stage
            ? node.requires?.policies
            : node.requires?.history;
        ensure(
          priorOption &&
            references?.some(
              (reference) => reference.decision === prior.id && reference.option === priorOption.id,
            ),
          `${node.id}.requires: ルートの所属または履歴が必要です`,
        );
      }
      if (node.route_stage !== undefined && group?.layout === "branches")
        ensure(
          node.route_stage < (group.stage_labels?.length ?? 0) &&
            (node.kind === "policy" ||
              node.id === group.switch_decision ||
              node.route_stage === Math.min(4, Math.floor(node.min_age_months / 48))),
          `${node.id}.route_stage`,
        );
      else if (node.route_stage !== undefined)
        ensure(
          game.decisions.some(
            (other) =>
              other.route_group === node.route_group &&
              other.route_stage === node.route_stage &&
              other.kind === "policy" &&
              other.options.some((option) => option.route),
          ) ||
            (node.kind === "action" &&
              node.route_stage ===
                Math.max(
                  ...game.decisions
                    .filter(
                      (other) =>
                        other.route_group === node.route_group &&
                        other.kind === "policy" &&
                        other.options.some((option) => option.route),
                    )
                    .map((other) => other.route_stage ?? -1),
                ) +
                  1),
          `${node.id}.route_stage`,
        );
    } else ensure(node.route === undefined && node.route_stage === undefined, `${node.id}.route`);
    ensure(
      new Set(node.options.map((o) => o.id)).size === node.options.length,
      `${node.id}.options: ID重複`,
    );
    ensure(
      node.options.every((o) => o.id !== "cancel"),
      `${node.id}: cancelは予約IDです`,
    );
    if (node.requires) requirements.push(node.requires);
    for (const o of node.options) {
      ensure(
        (!o.route || (node.kind === "policy" && node.route_group && !node.route)) &&
          (!o.switch_to || groups.get(node.route_group ?? "")?.switch_decision === node.id),
        `${node.id}.${o.id}.route`,
      );
      ensure(!o.visual || Object.hasOwn(content.visuals, o.visual), `${node.id}.${o.id}.visual`);
      ensure(
        (o.income_reduction ?? 0) <= o.cost,
        `${node.id}.${o.id}: 減収は家計負担costにも含めてください`,
      );
      if (o.requires) requirements.push(o.requires);
      if (o.maintains) requirements.push(o.maintains);
    }
    if (node.kind === "policy") {
      const fallback = node.options.find((o) => o.id === node.default_option);
      ensure(
        fallback &&
          !fallback.requires &&
          !fallback.maintains &&
          fallback.cost === 0 &&
          fallback.setup_cost === 0 &&
          fallback.income === 0,
        `${node.id}.default_option: 無条件・無料の既定設定が必要です`,
      );
      ensure(!node.once && node.cooldown === 1, `${node.id}: 方針に再発制限は指定できません`);
    } else {
      ensure(
        node.default_option === null &&
          node.options.every((o) => o.setup_cost === 0 && !o.maintains),
        `${node.id}: 単発行動は継続・開始費を持ちません`,
      );
    }
  }
  for (const r of requirements) {
    for (const ref of [...(r.history ?? []), ...(r.policies ?? [])])
      ensure(
        nodes.get(ref.decision)?.options.some((o) => o.id === ref.option),
        `life_game.reference.${ref.decision}:${ref.option}`,
      );
    for (const ref of r.policies ?? [])
      ensure(nodes.get(ref.decision)?.kind === "policy", `${ref.decision}: 継続方針ではありません`);
  }
  // 正の履歴・方針前提が循環して入口を失う設定を拒否する。数値条件の成立はプレイテストで確認する。
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
      for (const o of node.options) {
        const key = `${node.id}:${o.id}`;
        if (!reachable.has(key) && possible(o.requires) && possible(o.maintains)) {
          reachable.add(key);
          changed = true;
        }
      }
    }
  }
  for (const node of game.decisions)
    for (const o of node.options)
      ensure(reachable.has(`${node.id}:${o.id}`), `life_game.unreachable.${node.id}:${o.id}`);
}
