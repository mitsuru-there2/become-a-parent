import { stageModel, stageIndex } from "./stage_state";
import * as v from "valibot";
import { dictionary, integer, contentIdSchema } from "../validation/primitives";
import type { State } from "./types";
import { contentFor } from "../content/catalog";
const lifeStateSchema = v.strictObject({
  stage_routes: v.optional(dictionary(contentIdSchema, false)),
  policies: dictionary(contentIdSchema),
  history: dictionary(
    v.strictObject({
      first_turn: integer(1, 40),
      last_turn: integer(1, 40),
      count: integer(1, 40),
    }),
    false,
  ),
  route_stage_resolved: v.optional(dictionary(integer(0, 40), false)),
  visible: v.array(v.string()),
  fresh: v.array(contentIdSchema),
  notices: v.array(v.string()),
});
export function validateLifeState(state: State) {
  if (!v.is(lifeStateSchema, state.life)) throw new Error("生活状態の構造が不正です");
  const nodes = contentFor(state).life_game!.decisions;
  if (stageModel(state)) {
    const life = state.life;
    const groups = contentFor(state).life_game!.route_groups!;
    if (
      !life.stage_routes ||
      Object.keys(life.policies).length ||
      Object.keys(state.decisions!.selections).length ||
      life.route_stage_resolved !== undefined ||
      life.visible.length ||
      life.fresh.length ||
      life.notices.length
    )
      throw new Error("ステージ状態が不正です");
    for (const [id, route] of Object.entries(life.stage_routes)) {
      const [stage, groupId] = id.split(":");
      const group = groups.find((g) => g.id === groupId);
      if (
        !/^[0-4]$/.test(stage) ||
        id !== `${stage}:${groupId}` ||
        Number(stage) > stageIndex(state) ||
        !group?.routes.some((r) => r.id === route)
      )
        throw new Error("ルート記録が不正です");
    }
    for (let index = 0; index <= stageIndex(state); index++)
      if (index < stageIndex(state) || state.n % 8 !== 0 || state.phase !== "childhood")
        for (const group of groups)
          if (!life.stage_routes[`${index}:${group.id}`])
            throw new Error("確定済みルートがありません");
    for (const [id, acquired] of Object.entries(life.history)) {
      const node = nodes.find((n) => n.options.some((o) => `${n.id}:${o.id}` === id));
      const option = node?.options.find((o) => `${node.id}:${o.id}` === id);
      const index = Math.floor((acquired.first_turn - 1) / 8);
      const route = life.stage_routes[`${index}:${node?.route_group}`];
      if (
        !node ||
        !option ||
        acquired.count !== 1 ||
        acquired.first_turn !== acquired.last_turn ||
        acquired.first_turn > Math.min(40, state.n + (state.phase === "childhood" ? 1 : 0)) ||
        !node.stages?.includes(index) ||
        !route ||
        !option.routes?.includes(route)
      )
        throw new Error("選択の取得記録が不正です");
    }
    return;
  }
  if (
    ["rules-10", "rules-11", "rules-12", "rules-13"].includes(state.versions.rules) &&
    (!state.life.route_stage_resolved ||
      Object.entries(state.life.route_stage_resolved).some(
        ([id, turn]) =>
          !nodes.some(
            (node) => node.id === id && node.route_stage !== undefined && node.kind === "policy",
          ) || turn > state.n,
      ))
  )
    throw new Error("学校ルートの進級状態が不正です");
  const policies = nodes.filter((d) => d.kind === "policy");
  if (
    Object.keys(state.life.policies).length !== policies.length ||
    policies.some((d) => !d.options.some((o) => o.id === state.life!.policies[d.id]))
  )
    throw new Error("生活方針が不正です");
  const optionIds = new Set(nodes.flatMap((d) => d.options.map((o) => `${d.id}:${o.id}`)));
  if (
    state.life.visible.some((id) => !optionIds.has(id)) ||
    state.life.fresh.some((id) => !nodes.some((d) => d.id === id))
  )
    throw new Error("表示した判断が不正です");
  for (const [id, history] of Object.entries(state.life.history))
    if (
      !optionIds.has(id) ||
      history.first_turn > history.last_turn ||
      history.last_turn > state.n ||
      history.count > history.last_turn - history.first_turn + 1
    )
      throw new Error("判断履歴が不正です");
  for (const [instance, option] of Object.entries(state.decisions!.selections)) {
    if (
      !optionIds.has(option) ||
      instance !== `t${String(state.n + 1).padStart(2, "0")}:${option.split(":")[0]}`
    )
      // 最終期に確定した予定は旧方式と同様に終了snapshotへ残す。
      if (
        !(
          state.phase !== "childhood" &&
          optionIds.has(option) &&
          instance === `t${String(state.n).padStart(2, "0")}:${option.split(":")[0]}`
        )
      )
        throw new Error("保存された予定が不正です");
  }
}
