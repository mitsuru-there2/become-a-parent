import { stageModel, stageIndex, stageRouteId } from "./stage_state";
import * as v from "valibot";
import { dictionary, integer, contentIdSchema } from "../validation/primitives";
import type { State } from "./types";
import { contentFor } from "../content/catalog";
const lifeStateSchema = v.strictObject({
  stage_routes: v.optional(dictionary(contentIdSchema, false)),
  pending: v.optional(v.array(v.string())),
  turn_start_cash: v.optional(v.number()),
  turn_result: v.optional(
    v.object({
      turn: integer(1, 40),
      before: v.record(v.string(), v.number()),
      after: v.record(v.string(), v.number()),
    }),
  ),
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
      (state.versions.rules !== "rules-14" && life.notices.length)
    )
      throw new Error("ステージ状態が不正です");
    if (life.pending) {
      if (
        life.pending.length !== new Set(life.pending).size ||
        life.pending.some(
          (id) => !life.history[id] || life.history[id].first_turn !== state.n + 1,
        ) ||
        (state.phase !== "childhood" && life.pending.length > 0) ||
        life.turn_start_cash === undefined ||
        (life.turn_result && life.turn_result.turn !== state.n)
      )
        throw new Error("今期の取得予定が不正です");
    }
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
    if (state.versions.rules === "rules-14")
      for (const group of groups) {
        const changes = state.history.flatMap((entry) =>
          entry.kind === "special" && entry.turn === 1
            ? entry.events.filter((event) => event.event_id === stageRouteId(group.id))
            : [],
        );
        const route = changes[0]?.option_id?.split(":")[1] ?? group.routes[0].id;
        if (
          changes.length > 1 ||
          (changes.length === 1 && route === group.routes[0].id) ||
          !group.routes.some((item) => item.id === route)
        )
          throw new Error("初回ルートの変更記録が不正です");
        if (life.stage_routes[`0:${group.id}`] !== route)
          throw new Error("初回ルートと変更記録が一致しません");
      }
    for (let index = 0; index <= stageIndex(state); index++)
      if (
        index > 0 ||
        index < stageIndex(state) ||
        state.n % 8 !== 0 ||
        state.phase !== "childhood"
      )
        for (const group of groups)
          if (!life.stage_routes[`${index}:${group.id}`])
            throw new Error("確定済みルートがありません");
    for (const [id, acquired] of Object.entries(life.history)) {
      const node = nodes.find((n) => n.options.some((o) => `${n.id}:${o.id}` === id));
      const option = node?.options.find((o) => `${node.id}:${o.id}` === id);
      const index = Math.floor((acquired.first_turn - 1) / 8);
      // A choice may be acquired on the inherited route before an optional switch.
      // Validate its route at acquisition, not the final route of the stage.
      let route = index
        ? life.stage_routes[`${index - 1}:${node?.route_group}`]
        : state.versions.rules === "rules-14"
          ? groups.find((group) => group.id === node?.route_group)?.routes[0]?.id
          : undefined;
      let recorded = false;
      for (const entry of state.history) {
        if (
          entry.kind !== "special" ||
          entry.turn === null ||
          Math.floor((entry.turn - 1) / 8) !== index
        )
          continue;
        for (const event of entry.events) {
          if (event.event_id === stageRouteId(node?.route_group ?? ""))
            route = event.option_id?.split(":")[1];
          if (event.option_id === id && entry.turn === acquired.first_turn) recorded = true;
        }
        if (recorded) break;
      }
      if (
        !node ||
        !option ||
        !recorded ||
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
