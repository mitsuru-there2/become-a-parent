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
  const requirements: LifeRequirement[] = [...eventRequirements];
  for (const node of game.decisions) {
    ensure(menus.has(node.menu), `${node.id}.menu`);
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
